// Bulk-paste question importer.
//
// Accepted format (blank line between questions):
//
//   ## Section A — Objectives [auto]        <- optional section headers
//   1. What is the SI unit of force?
//   A. Joule
//   *B. Newton                              <- * marks the correct option
//   C. Pascal
//   D. Watt
//   EXP: Force = mass x acceleration ...    <- optional explanation
//
//   ## Section B — Theory [self]
//   6. Derive the equation of motion ...
//   ANS: Starting from a = dv/dt ...        <- theory answer (optional)
//   EXP: Marks are awarded for ...
//
// Alternative correct marker: a line "ANS: B" on an MCQ.

export type ParsedSection = {
  label: string;
  scoring: "auto" | "self";
};

export type ParsedQuestion = {
  number: number;
  type: "mcq" | "theory";
  body: string;
  options: { key: string; text: string }[];
  correct: string | null;
  answer: string | null;
  explanation: string | null;
  sectionIndex: number | null;
};

export type ParseResult = {
  sections: ParsedSection[];
  questions: ParsedQuestion[];
  errors: string[];
};

const OPTION_RE = /^(\*?)([A-H])[.)]\s+(.*)$/;
const NUMBER_RE = /^(\d+)[.)]\s+(.*)$/;
const SECTION_RE = /^##\s+(.*?)(?:\s+\[(auto|self)\])?\s*$/;

export function parseQuestions(input: string): ParseResult {
  const sections: ParsedSection[] = [];
  const questions: ParsedQuestion[] = [];
  const errors: string[] = [];

  let current: ParsedQuestion | null = null;
  let sectionIndex: number | null = null;
  const seenNumbers = new Set<number>();

  const push = () => {
    if (!current) return;
    if (current.options.length > 0) {
      current.type = "mcq";
      if (!current.correct) {
        errors.push(`Question ${current.number}: no correct option marked (use * or "ANS: X").`);
      }
    } else {
      current.type = "theory";
    }
    if (seenNumbers.has(current.number)) {
      errors.push(`Question ${current.number}: duplicate question number.`);
    }
    seenNumbers.add(current.number);
    questions.push(current);
    current = null;
  };

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const sec = trimmed.match(SECTION_RE);
    if (sec) {
      push();
      const label = sec[1].trim();
      const scoring =
        (sec[2] as "auto" | "self" | undefined) ??
        (/theory|essay/i.test(label) ? "self" : "auto");
      sections.push({ label, scoring });
      sectionIndex = sections.length - 1;
      continue;
    }

    const num = trimmed.match(NUMBER_RE);
    if (num) {
      push();
      current = {
        number: parseInt(num[1], 10),
        type: "theory",
        body: num[2],
        options: [],
        correct: null,
        answer: null,
        explanation: null,
        sectionIndex,
      };
      continue;
    }

    if (!current) {
      if (trimmed) errors.push(`Unattached line ignored: "${trimmed.slice(0, 60)}"`);
      continue;
    }

    const opt = trimmed.match(OPTION_RE);
    if (opt) {
      const [, star, key, text] = opt;
      current.options.push({ key, text: text.trim() });
      if (star === "*") current.correct = key;
      continue;
    }

    const ansMatch = trimmed.match(/^ANS(?:WER)?:\s*(.*)$/i);
    if (ansMatch) {
      const val = ansMatch[1].trim();
      // Single letter on an MCQ-looking question = correct option key.
      if (/^[A-H]$/.test(val) && current.options.length > 0) {
        current.correct = val;
      } else {
        current.answer = val;
      }
      continue;
    }

    const expMatch = trimmed.match(/^EXP(?:LANATION)?:\s*(.*)$/i);
    if (expMatch) {
      current.explanation = expMatch[1].trim();
      continue;
    }

    if (trimmed === "") continue;

    // Continuation line: extend the most recent field.
    if (current.explanation !== null) current.explanation += "\n" + trimmed;
    else if (current.answer !== null) current.answer += "\n" + trimmed;
    else if (current.options.length > 0) {
      current.options[current.options.length - 1].text += " " + trimmed;
    } else current.body += "\n" + trimmed;
  }
  push();

  if (questions.length === 0) errors.push("No questions found. Check the format guide.");
  return { sections, questions, errors };
}

// Minimal CSV importer: number,type,body,optionA,optionB,optionC,optionD,correct,answer,explanation
export function parseCsv(input: string): ParseResult {
  const questions: ParsedQuestion[] = [];
  const errors: string[] = [];
  const rows = input.split(/\r?\n/).filter((r) => r.trim());
  const start = /^\s*number\s*,/i.test(rows[0] ?? "") ? 1 : 0;

  for (let i = start; i < rows.length; i++) {
    const cells = splitCsvRow(rows[i]);
    if (cells.length < 3) {
      errors.push(`Row ${i + 1}: needs at least number,type,body.`);
      continue;
    }
    const [numStr, type, body, a, b, c, d, correct, answer, explanation] = cells;
    const number = parseInt(numStr, 10);
    if (isNaN(number)) {
      errors.push(`Row ${i + 1}: invalid question number "${numStr}".`);
      continue;
    }
    const options = [
      { key: "A", text: a },
      { key: "B", text: b },
      { key: "C", text: c },
      { key: "D", text: d },
    ].filter((o) => o.text && o.text.trim());
    const isMcq = type.trim().toLowerCase() === "mcq";
    if (isMcq && !correct?.trim()) {
      errors.push(`Row ${i + 1}: MCQ missing correct option.`);
    }
    questions.push({
      number,
      type: isMcq ? "mcq" : "theory",
      body: body.trim(),
      options: isMcq ? options : [],
      correct: isMcq ? correct?.trim().toUpperCase() || null : null,
      answer: answer?.trim() || null,
      explanation: explanation?.trim() || null,
      sectionIndex: null,
    });
  }
  if (questions.length === 0) errors.push("No rows parsed.");
  return { sections: [], questions, errors };
}

function splitCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
