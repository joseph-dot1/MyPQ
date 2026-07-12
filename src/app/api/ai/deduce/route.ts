import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { retrieveChunks, retrieveAnsweredQuestions } from "@/lib/ai/retrieval";
import {
  groundedSystemPrompt,
  contextPackage,
  deducePrompt,
  NOT_COVERED_TOKEN,
  NOT_COVERED_MESSAGE,
} from "@/lib/ai/grounding";
import { groundedCompletion, extractJson } from "@/lib/ai/anthropic";
import { hasActivePremium } from "@/lib/server/premium";

type Deduced = { correct_option?: string; answer?: string; explanation?: string };

// Answer deduction: for a past question with no stored answer, the AI drafts
// one from the materials. Stored with answer_source='ai_deduced' — every
// student-facing render carries the "Deduced from course material" badge.
// Admin can later edit and promote it to 'verified'.
export async function POST(request: Request) {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { question_id } = await request.json();
  if (!question_id) return NextResponse.json({ error: "question_id required" }, { status: 400 });

  const db = supabaseService();

  const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";
  if (!isAdmin && !(await hasActivePremium(db, user.id))) {
    return NextResponse.json({ error: "premium_required" }, { status: 403 });
  }

  const { data: q } = await db
    .from("questions")
    .select("*, question_sets!inner(course_id, lecturer_id)")
    .eq("id", question_id)
    .single();
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  if (q.answer_md || q.correct_option) {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  const courseId = (q as any).question_sets.course_id as string;
  const lecturerId = (q as any).question_sets.lecturer_id as string | null;

  const [chunks, answered] = await Promise.all([
    retrieveChunks(db, { courseId, lecturerId, queryText: q.body_md }),
    retrieveAnsweredQuestions(db, courseId, lecturerId, 8),
  ]);

  const context = contextPackage(chunks, answered);
  const prompt = deducePrompt(context, q.body_md, q.options);

  const result = await groundedCompletion(groundedSystemPrompt(), prompt, 1024);

  await db.from("ai_generations").insert({
    user_id: user.id,
    course_id: courseId,
    lecturer_id: lecturerId,
    kind: "deduce",
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
  });

  if (result.text.includes(NOT_COVERED_TOKEN)) {
    return NextResponse.json({ not_covered: true, message: NOT_COVERED_MESSAGE });
  }

  const deduced = extractJson<Deduced>(result.text);
  if (!deduced || (!deduced.answer && !deduced.correct_option)) {
    return NextResponse.json({ error: "deduction_failed" }, { status: 502 });
  }

  const update: Record<string, unknown> = { answer_source: "ai_deduced" };
  if (q.type === "mcq" && deduced.correct_option) update.correct_option = deduced.correct_option;
  if (deduced.answer) update.answer_md = deduced.answer;
  if (deduced.explanation) update.explanation_md = deduced.explanation;

  await db.from("questions").update(update).eq("id", question_id);

  return NextResponse.json({ deduced: true, ...update });
}
