import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { retrieveChunks, retrieveAnsweredQuestions } from "@/lib/ai/retrieval";
import {
  groundedSystemPrompt,
  contextPackage,
  explainPrompt,
  NOT_COVERED_TOKEN,
  NOT_COVERED_MESSAGE,
} from "@/lib/ai/grounding";
import { groundedCompletion } from "@/lib/ai/anthropic";
import { hasActivePremium } from "@/lib/server/premium";

export async function POST(request: Request) {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { question_id } = await request.json();
  if (!question_id) return NextResponse.json({ error: "question_id required" }, { status: 400 });

  const db = supabaseService();

  if (!(await hasActivePremium(db, user.id))) {
    return NextResponse.json({ error: "premium_required" }, { status: 403 });
  }

  // Cached? Explanations are never regenerated on view.
  const { data: cached } = await db
    .from("ai_explanations")
    .select("explanation_md")
    .eq("question_id", question_id)
    .maybeSingle();
  if (cached) return NextResponse.json({ explanation: cached.explanation_md, cached: true });

  const { data: q } = await db
    .from("questions")
    .select("*, question_sets!inner(course_id, lecturer_id)")
    .eq("id", question_id)
    .single();
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const courseId = (q as any).question_sets.course_id as string;
  const lecturerId = (q as any).question_sets.lecturer_id as string | null;

  const [chunks, answered] = await Promise.all([
    retrieveChunks(db, { courseId, lecturerId, queryText: q.body_md }),
    retrieveAnsweredQuestions(db, courseId, lecturerId, 8),
  ]);

  const context = contextPackage(chunks, answered);
  const prompt = explainPrompt(context, q.body_md, q.options, q.correct_option, q.answer_md);

  const result = await groundedCompletion(groundedSystemPrompt(), prompt, 1024);

  await db.from("ai_generations").insert({
    user_id: user.id,
    course_id: courseId,
    lecturer_id: lecturerId,
    kind: "explain",
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
  });

  if (result.text.includes(NOT_COVERED_TOKEN)) {
    return NextResponse.json({ not_covered: true, message: NOT_COVERED_MESSAGE });
  }

  await db
    .from("ai_explanations")
    .upsert({ question_id, explanation_md: result.text }, { onConflict: "question_id" });

  return NextResponse.json({ explanation: result.text, cached: false });
}
