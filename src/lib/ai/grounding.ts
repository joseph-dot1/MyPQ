// Grounding rules — the hard constraint of the whole AI feature.
// Lecturers mark against THEIR material; an internet-correct answer can be a
// lecturer-wrong answer. Every prompt built here forbids outside knowledge.

import type { RetrievedChunk } from "./retrieval";

export const NOT_COVERED_TOKEN = "NOT_COVERED_BY_MATERIAL";

export const NOT_COVERED_MESSAGE =
  "The uploaded course material doesn't cover this yet — check your handout or ask your course rep.";

export function groundedSystemPrompt(): string {
  return [
    "You are an exam-preparation assistant for a Nigerian polytechnic course.",
    "Answer ONLY from the provided course material and past answers. Do not use outside knowledge.",
    `If the material does not contain enough information to answer, respond with exactly the token ${NOT_COVERED_TOKEN} and nothing else.`,
    "Match the terminology, notation and conventions used in the provided material, even where they differ from common usage — the student is marked against this material.",
    "Write in plain, direct language a student can revise from. No hype, no exclamation marks.",
  ].join("\n");
}

export function contextPackage(
  chunks: RetrievedChunk[],
  answered: { body_md: string; answer: string }[]
): string {
  const parts: string[] = [];
  if (chunks.length) {
    parts.push("<course_material>");
    chunks.forEach((c, i) => parts.push(`[Extract ${i + 1}]\n${c.chunk_text}`));
    parts.push("</course_material>");
  }
  if (answered.length) {
    parts.push("<past_questions_with_known_answers>");
    answered.forEach((q, i) =>
      parts.push(`Q${i + 1}: ${q.body_md}\nKnown answer: ${q.answer}`)
    );
    parts.push("</past_questions_with_known_answers>");
  }
  if (!parts.length) parts.push("<course_material>(no material uploaded yet)</course_material>");
  return parts.join("\n\n");
}

export function explainPrompt(
  context: string,
  questionBody: string,
  options: { key: string; text: string }[] | null,
  correct: string | null,
  answer: string | null
): string {
  const lines = [context, "", "The student is reviewing this past question:", questionBody];
  if (options?.length) {
    lines.push("Options:");
    for (const o of options) lines.push(`${o.key}. ${o.text}`);
  }
  if (correct) lines.push(`Marking-scheme answer: ${correct}`);
  if (answer) lines.push(`Marking-scheme answer: ${answer}`);
  lines.push(
    "",
    "Explain, using only the material above, why the marking-scheme answer is correct.",
    "Keep it under 150 words. If the material doesn't cover it, output the not-covered token."
  );
  return lines.join("\n");
}

export function deducePrompt(
  context: string,
  questionBody: string,
  options: { key: string; text: string }[] | null
): string {
  const lines = [
    context,
    "",
    "This past question has no stored answer. Deduce the answer strictly from the material above.",
    "Question:",
    questionBody,
  ];
  if (options?.length) {
    lines.push("Options:");
    for (const o of options) lines.push(`${o.key}. ${o.text}`);
    lines.push(
      "",
      'Respond as JSON: {"correct_option": "X", "answer": "one-line answer", "explanation": "why, citing the material"}'
    );
  } else {
    lines.push(
      "",
      'Respond as JSON: {"answer": "the model answer a lecturer would accept", "explanation": "why, citing the material"}'
    );
  }
  lines.push(`If the material doesn't cover it, output only the token ${NOT_COVERED_TOKEN}.`);
  return lines.join("\n");
}

export function generatePrompt(
  context: string,
  courseCode: string,
  lecturerName: string | null,
  styleNotes: string | null,
  exampleQuestions: { body_md: string; answer: string }[],
  count: number
): string {
  const lines = [context, ""];
  if (exampleQuestions.length) {
    lines.push(
      lecturerName
        ? `Past questions set by ${lecturerName} for ${courseCode} (imitate their style, difficulty and phrasing):`
        : `Past questions for ${courseCode} (imitate their style and difficulty):`
    );
    exampleQuestions.slice(0, 10).forEach((q, i) => lines.push(`Example ${i + 1}: ${q.body_md}`));
  }
  if (styleNotes) lines.push("", `Notes on the lecturer's style: ${styleNotes}`);
  lines.push(
    "",
    `Write ${count} NEW practice questions for ${courseCode}, grounded strictly in the material above.`,
    "Mix multiple-choice and short theory in the same proportion as the examples.",
    "Respond as a JSON array. Each item:",
    '{"type":"mcq","body":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correct":"A","explanation":"..."}',
    'or {"type":"theory","body":"...","answer":"...","explanation":"..."}',
    "Every question must be answerable from the provided material alone.",
    `If the material is too thin to write ${count} grounded questions, write fewer. If there is no usable material at all, output only the token ${NOT_COVERED_TOKEN}.`
  );
  return lines.join("\n");
}
