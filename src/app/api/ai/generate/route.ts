import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { retrieveChunks, retrieveAnsweredQuestions } from "@/lib/ai/retrieval";
import {
  groundedSystemPrompt,
  contextPackage,
  generatePrompt,
  NOT_COVERED_TOKEN,
  NOT_COVERED_MESSAGE,
} from "@/lib/ai/grounding";
import { groundedCompletion, extractJson } from "@/lib/ai/anthropic";
import { meterGeneration } from "@/lib/server/premium";

type GeneratedQuestion = {
  type: "mcq" | "theory";
  body: string;
  options?: { key: string; text: string }[];
  correct?: string;
  answer?: string;
  explanation?: string;
};

export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { course_id, lecturer_id, count } = await request.json();
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 });
  const n = Math.min(Math.max(parseInt(count || "10", 10) || 10, 5), 20);

  const db = supabaseService();

  const meter = await meterGeneration(db, user.id);
  if (!meter.allowed) {
    return NextResponse.json({ error: meter.reason }, { status: 403 });
  }

  const { data: course } = await db
    .from("courses")
    .select("id, code, title")
    .eq("id", course_id)
    .single();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  let lecturer: { id: string; name: string; style_notes: string | null } | null = null;
  if (lecturer_id) {
    const { data } = await db
      .from("lecturers")
      .select("id, name, style_notes")
      .eq("id", lecturer_id)
      .maybeSingle();
    lecturer = data;
  }

  const [chunks, answered] = await Promise.all([
    retrieveChunks(db, {
      courseId: course_id,
      lecturerId: lecturer?.id ?? null,
      queryText: `${course.code} ${course.title}`,
      limit: 16,
    }),
    retrieveAnsweredQuestions(db, course_id, lecturer?.id ?? null, 12),
  ]);

  const context = contextPackage(chunks, answered);
  const prompt = generatePrompt(
    context,
    course.code,
    lecturer?.name ?? null,
    lecturer?.style_notes ?? null,
    answered,
    n
  );

  const result = await groundedCompletion(groundedSystemPrompt(), prompt, 4096);

  if (result.text.includes(NOT_COVERED_TOKEN)) {
    return NextResponse.json({ not_covered: true, message: NOT_COVERED_MESSAGE });
  }

  const parsed = extractJson<GeneratedQuestion[]>(result.text);
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  // Need an AI session bucket; reuse the newest session.
  const { data: session } = await db
    .from("sessions")
    .select("id")
    .order("start_year", { ascending: false })
    .limit(1)
    .single();

  const { data: set, error: setError } = await db
    .from("question_sets")
    .insert({
      course_id,
      session_id: session!.id,
      semester: "First",
      lecturer_id: lecturer?.id ?? null,
      type: "ai_generated",
      source: "ai",
      is_premium: true, // AI practice is a premium feature
      created_by: user.id,
    })
    .select("id")
    .single();
  if (setError || !set) {
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  const rows = parsed
    .filter((q) => q && q.body)
    .map((q, i) => ({
      question_set_id: set.id,
      number: i + 1,
      type: q.type === "mcq" ? "mcq" : "theory",
      body_md: q.body,
      options: q.type === "mcq" ? q.options ?? null : null,
      correct_option: q.type === "mcq" ? q.correct ?? null : null,
      answer_md: q.type === "theory" ? q.answer ?? null : null,
      explanation_md: q.explanation ?? null,
      answer_source: "admin" as const, // generated with its own key, not deduced
    }));
  await db.from("questions").insert(rows);

  await db.from("ai_generations").insert({
    user_id: user.id,
    course_id,
    lecturer_id: lecturer?.id ?? null,
    kind: "generate",
    source_question_set_ids: answered.length ? Array.from(new Set(answered.map((a) => a.set_id))) : null,
    output_question_set_id: set.id,
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
  });

  return NextResponse.json({ set_id: set.id, count: rows.length, used_credit: meter.usedCredit });
}
