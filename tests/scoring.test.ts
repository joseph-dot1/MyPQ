import { describe, it, expect } from "vitest";
import {
  combineResults,
  optionTextFor,
  scoreMcq,
  type GivenAnswer,
} from "../src/lib/scoring";
import type { Question, QuestionSection } from "../src/lib/types";

const mcq = (id: string, number: number, sectionId: string | null, correct = "B"): Question => ({
  id,
  question_set_id: "set1",
  section_id: sectionId,
  number,
  type: "mcq",
  body_md: `Question ${number}`,
  options: [
    { key: "A", text: `Alpha ${number}` },
    { key: "B", text: `Bravo ${number}` },
    { key: "C", text: `Charlie ${number}` },
    { key: "D", text: `Delta ${number}` },
  ],
  correct_option: correct,
  answer_md: null,
  explanation_md: null,
  answer_source: "admin",
});

const theory = (id: string, number: number, sectionId: string | null): Question => ({
  id,
  question_set_id: "set1",
  section_id: sectionId,
  number,
  type: "theory",
  body_md: `Theory ${number}`,
  options: null,
  correct_option: null,
  answer_md: "Model answer",
  explanation_md: null,
  answer_source: "admin",
});

const sectionA: QuestionSection = {
  id: "secA",
  question_set_id: "set1",
  label: "Section A — Objectives",
  position: 0,
  scoring: "auto",
};
const sectionB: QuestionSection = {
  id: "secB",
  question_set_id: "set1",
  label: "Section B — Theory",
  position: 1,
  scoring: "self",
};

describe("scoring trust rule: picked option is EXACTLY the option shown", () => {
  it("resolves the given key to the same text in review", () => {
    const q = mcq("q1", 1, null);
    // Student tapped C; review must show Charlie 1, never a shifted option.
    expect(optionTextFor(q, "C")).toBe("Charlie 1");
    expect(optionTextFor(q, "A")).toBe("Alpha 1");
  });

  it("scores by key identity, not by array position", () => {
    const q = mcq("q1", 1, null, "D");
    // Shuffle display order — key identity must be unaffected.
    q.options = [q.options![3], q.options![0], q.options![2], q.options![1]];
    expect(scoreMcq(q, "D").is_correct).toBe(true);
    expect(scoreMcq(q, "A").is_correct).toBe(false);
    expect(optionTextFor(q, "D")).toBe("Delta 1");
  });

  it("no answer given means wrong, not crash", () => {
    const q = mcq("q1", 1, null);
    const r = scoreMcq(q, null);
    expect(r.is_correct).toBe(false);
    expect(r.points).toBe(0);
    expect(optionTextFor(q, null)).toBeNull();
  });

  it("a question with no stored correct option is unmarkable, not wrong", () => {
    const q = mcq("q1", 1, null);
    q.correct_option = null;
    const r = scoreMcq(q, "A");
    expect(r.is_correct).toBeNull();
    expect(r.points).toBe(0);
  });
});

describe("mixed papers combine into ONE result", () => {
  const questions = [
    mcq("q1", 1, "secA"),
    mcq("q2", 2, "secA"),
    mcq("q3", 3, "secA"),
    theory("q4", 4, "secB"),
    theory("q5", 5, "secB"),
  ];

  it("auto-scores Section A, self-marks Section B, sums both", () => {
    const answers: GivenAnswer[] = [
      { question_id: "q1", given: "B", self_mark: null }, // right
      { question_id: "q2", given: "A", self_mark: null }, // wrong
      { question_id: "q3", given: "B", self_mark: null }, // right
      { question_id: "q4", given: "my derivation", self_mark: 1 },
      { question_id: "q5", given: "half of it", self_mark: 0.5 },
    ];
    const result = combineResults(questions, [sectionA, sectionB], answers);
    expect(result.total).toBe(5);
    expect(result.score).toBe(3.5);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].label).toBe("Section A — Objectives");
    expect(result.sections[0].score).toBe(2);
    expect(result.sections[1].score).toBe(1.5);
  });

  it("sections come out in position order regardless of input order", () => {
    const result = combineResults(questions, [sectionB, sectionA], []);
    expect(result.sections[0].label).toBe("Section A — Objectives");
    expect(result.sections[1].label).toBe("Section B — Theory");
  });

  it("unmarked theory contributes zero and stays unmarkable", () => {
    const answers: GivenAnswer[] = [{ question_id: "q4", given: "something", self_mark: null }];
    const result = combineResults(questions, [sectionA, sectionB], answers);
    const theoryResult = result.sections[1].questions.find((q) => q.question_id === "q4")!;
    expect(theoryResult.is_correct).toBeNull();
    expect(theoryResult.points).toBe(0);
  });

  it("self_mark is clamped to [0, 1]", () => {
    const answers: GivenAnswer[] = [
      { question_id: "q4", given: "x", self_mark: 5 },
      { question_id: "q5", given: "y", self_mark: -1 },
    ];
    const result = combineResults(questions, [sectionA, sectionB], answers);
    const [r4, r5] = result.sections[1].questions;
    expect(r4.points).toBe(1);
    expect(r5.points).toBe(0);
  });

  it("questions without a section still score (single-section papers)", () => {
    const loose = [mcq("q1", 1, null), mcq("q2", 2, null)];
    const result = combineResults(loose, [], [{ question_id: "q1", given: "B", self_mark: null }]);
    expect(result.total).toBe(2);
    expect(result.score).toBe(1);
    expect(result.sections).toHaveLength(1);
  });

  it("empty answers produce a zero score, not NaN", () => {
    const result = combineResults(questions, [sectionA, sectionB], []);
    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
  });
});
