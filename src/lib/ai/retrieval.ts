// Retrieval for AI grounding. MVP: keyword scoring over material_chunks
// filtered by course (and lecturer when set). The interface is deliberately
// narrow so a vector store can replace the internals later without touching
// any caller.

import type { SupabaseClient } from "@supabase/supabase-js";

export type RetrievedChunk = {
  id: string;
  material_id: string;
  chunk_text: string;
  position: number;
};

export type RetrievalQuery = {
  courseId: string;
  lecturerId?: string | null;
  queryText: string;
  limit?: number;
};

const STOPWORDS = new Set(
  "the a an and or of to in is are was were for on with by as at from this that which what who how why be been it its if then than".split(" ")
);

function keywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    )
  ).slice(0, 24);
}

export function scoreChunk(chunkText: string, terms: string[]): number {
  const lower = chunkText.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (lower.includes(t)) score += 1;
  }
  return score;
}

// Uses the service client (chunks are admin-only under RLS; retrieval is a
// server-side concern).
export async function retrieveChunks(
  db: SupabaseClient,
  q: RetrievalQuery
): Promise<RetrievedChunk[]> {
  const limit = q.limit ?? 12;
  let query = db
    .from("material_chunks")
    .select("id, material_id, chunk_text, position")
    .eq("course_id", q.courseId)
    .limit(400);
  if (q.lecturerId) query = query.eq("lecturer_id", q.lecturerId);

  const { data, error } = await query;
  if (error || !data) return [];

  const terms = keywords(q.queryText);
  if (terms.length === 0) return data.slice(0, limit);

  return (data as RetrievedChunk[])
    .map((c) => ({ c, s: scoreChunk(c.chunk_text, terms) }))
    .sort((a, b) => b.s - a.s)
    .filter((x, i) => x.s > 0 || i < 4) // always keep a few chunks for context
    .slice(0, limit)
    .map((x) => x.c);
}

// Answered past questions for the course feed few-shot grounding.
export async function retrieveAnsweredQuestions(
  db: SupabaseClient,
  courseId: string,
  lecturerId?: string | null,
  limit = 20
): Promise<{ set_id: string; body_md: string; answer: string }[]> {
  let query = db
    .from("questions")
    .select(
      "question_set_id, body_md, options, correct_option, answer_md, answer_source, question_sets!inner(course_id, lecturer_id, source)"
    )
    .eq("question_sets.course_id", courseId)
    .eq("question_sets.source", "admin")
    .limit(120);
  if (lecturerId) query = query.eq("question_sets.lecturer_id", lecturerId);

  const { data, error } = await query;
  if (error || !data) return [];

  const out: { set_id: string; body_md: string; answer: string }[] = [];
  for (const row of data as any[]) {
    let answer: string | null = null;
    if (row.correct_option && row.options) {
      const opt = (row.options as { key: string; text: string }[]).find(
        (o) => o.key === row.correct_option
      );
      answer = opt ? `${row.correct_option}. ${opt.text}` : row.correct_option;
    } else if (row.answer_md && row.answer_source !== "ai_deduced") {
      answer = row.answer_md;
    }
    if (answer) out.push({ set_id: row.question_set_id, body_md: row.body_md, answer });
    if (out.length >= limit) break;
  }
  return out;
}
