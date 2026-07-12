// Scoring for mixed papers: Section A (objectives, auto-scored) +
// Section B (theory, self-marked) combine into ONE result.
//
// Trust rule: the option a student picked is identified by its stable option
// KEY ("A"/"B"/...), never by array position or display order. The same key
// resolves to the exact same option text in review. Tests in
// tests/scoring.test.ts pin this down.

import type { Question, QuestionSection } from "./types";

export type GivenAnswer = {
  question_id: string;
  // MCQ: the option key the student tapped. Theory: their typed answer.
  given: string | null;
  // Theory self-mark: marks the student awarded themselves (0..1 fraction of
  // the question). null until self-marked.
  self_mark: number | null;
};

export type QuestionResult = {
  question_id: string;
  number: number;
  type: "mcq" | "theory";
  given: string | null;
  correct_option: string | null;
  is_correct: boolean | null; // null = unmarkable (theory not self-marked)
  points: number; // 0..1
};

export type SectionResult = {
  section_id: string | null;
  label: string;
  scoring: "auto" | "self";
  score: number;
  total: number;
  questions: QuestionResult[];
};

export type CombinedResult = {
  score: number;
  total: number;
  sections: SectionResult[];
};

export function optionTextFor(q: Question, key: string | null): string | null {
  if (!key || !q.options) return null;
  const opt = q.options.find((o) => o.key === key);
  return opt ? opt.text : null;
}

export function scoreMcq(q: Question, givenKey: string | null): QuestionResult {
  const correct =
    givenKey !== null && q.correct_option !== null && givenKey === q.correct_option;
  return {
    question_id: q.id,
    number: q.number,
    type: "mcq",
    given: givenKey,
    correct_option: q.correct_option,
    is_correct: q.correct_option === null ? null : correct,
    points: correct ? 1 : 0,
  };
}

export function scoreTheory(q: Question, answer: GivenAnswer | undefined): QuestionResult {
  const mark = answer?.self_mark ?? null;
  return {
    question_id: q.id,
    number: q.number,
    type: "theory",
    given: answer?.given ?? null,
    correct_option: null,
    is_correct: mark === null ? null : mark >= 0.5,
    points: mark === null ? 0 : Math.max(0, Math.min(1, mark)),
  };
}

export function combineResults(
  questions: Question[],
  sections: QuestionSection[],
  answers: GivenAnswer[]
): CombinedResult {
  const byId = new Map(answers.map((a) => [a.question_id, a]));
  const ordered = [...sections].sort((a, b) => a.position - b.position);

  const grouped = new Map<string | null, Question[]>();
  for (const q of questions) {
    const key = q.section_id ?? null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(q);
  }

  const sectionResults: SectionResult[] = [];

  const buildSection = (
    sectionId: string | null,
    label: string,
    scoring: "auto" | "self",
    qs: Question[]
  ) => {
    const results = qs
      .sort((a, b) => a.number - b.number)
      .map((q) => {
        const ans = byId.get(q.id);
        return q.type === "mcq" ? scoreMcq(q, ans?.given ?? null) : scoreTheory(q, ans);
      });
    sectionResults.push({
      section_id: sectionId,
      label,
      scoring,
      score: round2(results.reduce((s, r) => s + r.points, 0)),
      total: results.length,
      questions: results,
    });
  };

  for (const s of ordered) {
    const qs = grouped.get(s.id);
    if (qs && qs.length) buildSection(s.id, s.label, s.scoring, qs);
    grouped.delete(s.id);
  }
  // Questions without a section (single-section papers)
  const loose = grouped.get(null);
  if (loose && loose.length) {
    const allTheory = loose.every((q) => q.type === "theory");
    buildSection(null, "Questions", allTheory ? "self" : "auto", loose);
  }

  const score = round2(sectionResults.reduce((s, r) => s + r.score, 0));
  const total = sectionResults.reduce((s, r) => s + r.total, 0);
  return { score, total, sections: sectionResults };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
