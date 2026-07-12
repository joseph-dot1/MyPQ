import { describe, it, expect } from "vitest";
import { parseQuestions, parseCsv } from "../src/lib/import/parseQuestions";

describe("bulk paste importer", () => {
  it("parses a mixed paper with sections", () => {
    const input = `## Section A — Objectives [auto]
1. What is the SI unit of force?
A. Joule
*B. Newton
C. Pascal
D. Watt
EXP: F = ma.

2. Water boils at?
A. 90C
B. 80C
*C. 100C

## Section B — Theory [self]
3. Derive the first equation of motion.
ANS: v = u + at
EXP: 2 marks for working.`;

    const result = parseQuestions(input);
    expect(result.errors).toEqual([]);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].scoring).toBe("auto");
    expect(result.sections[1].scoring).toBe("self");
    expect(result.questions).toHaveLength(3);

    const [q1, q2, q3] = result.questions;
    expect(q1.type).toBe("mcq");
    expect(q1.correct).toBe("B");
    expect(q1.options).toHaveLength(4);
    expect(q1.explanation).toBe("F = ma.");
    expect(q1.sectionIndex).toBe(0);

    expect(q2.correct).toBe("C");

    expect(q3.type).toBe("theory");
    expect(q3.answer).toBe("v = u + at");
    expect(q3.sectionIndex).toBe(1);
  });

  it("accepts ANS: X as the correct-option marker", () => {
    const input = `1. Pick one
A. first
B. second
ANS: B`;
    const result = parseQuestions(input);
    expect(result.questions[0].correct).toBe("B");
    expect(result.errors).toEqual([]);
  });

  it("flags MCQs with no correct option", () => {
    const input = `1. Pick one
A. first
B. second`;
    const result = parseQuestions(input);
    expect(result.errors.some((e) => e.includes("no correct option"))).toBe(true);
  });

  it("flags duplicate numbers and empty input", () => {
    const dup = parseQuestions(`1. First one\nANS: yes\n\n1. Again\nANS: no`);
    expect(dup.errors.some((e) => e.includes("duplicate"))).toBe(true);
    expect(parseQuestions("").errors.length).toBeGreaterThan(0);
  });

  it("handles multi-line question bodies", () => {
    const input = `1. A beam is loaded as shown.
Calculate the reaction at support A.
ANS: 12 kN`;
    const result = parseQuestions(input);
    expect(result.questions[0].body).toContain("Calculate the reaction");
  });

  it("infers self scoring from Theory in the label", () => {
    const result = parseQuestions(`## Section B — Theory\n1. Explain.\nANS: Because.`);
    expect(result.sections[0].scoring).toBe("self");
  });
});

describe("csv importer", () => {
  it("parses mcq and theory rows", () => {
    const csv = `number,type,body,optionA,optionB,optionC,optionD,correct,answer,explanation
1,mcq,What is 2+2?,3,4,5,6,B,,Simple addition
2,theory,Define stress.,,,,,,"Force per unit area, σ = F/A",`;
    const result = parseCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].correct).toBe("B");
    expect(result.questions[1].answer).toContain("Force per unit area");
  });

  it("reports rows with missing correct option", () => {
    const csv = `1,mcq,Broken row,a,b,c,d,,,`;
    const result = parseCsv(csv);
    expect(result.errors.some((e) => e.includes("missing correct"))).toBe(true);
  });
});
