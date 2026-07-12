"use client";

// Question set editor: metadata, sections, question list (with deduce/verify
// for AI-deduced answers), single-question form, bulk paste importer with
// parse preview, and CSV upload.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { parseQuestions, parseCsv, type ParseResult } from "@/lib/import/parseQuestions";
import { DeducedBadge } from "@/components/Badges";
import type { Lecturer, Question, QuestionSection, QuestionSet } from "@/lib/types";

const FORMAT_GUIDE = `## Section A — Objectives [auto]
1. What is the SI unit of force?
A. Joule
*B. Newton
C. Pascal
EXP: F = ma, measured in newtons.

## Section B — Theory [self]
6. Derive the first equation of motion.
ANS: v = u + at, starting from a = (v - u)/t
EXP: 2 marks for the derivation, 1 for the statement.`;

export default function SetEditorPage() {
  const params = useParams<{ id: string }>();
  const supabase = supabaseBrowser();

  const [set, setSet] = useState<QuestionSet | null>(null);
  const [sections, setSections] = useState<QuestionSection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [tab, setTab] = useState<"list" | "single" | "bulk" | "csv">("list");
  const [message, setMessage] = useState<string | null>(null);

  // bulk paste state
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);

  // single question form
  const [single, setSingle] = useState({
    type: "mcq",
    body: "",
    options: ["", "", "", ""],
    correct: "A",
    answer: "",
    explanation: "",
    section_id: "",
  });

  const load = async () => {
    const [s, sec, q, l] = await Promise.all([
      supabase.from("question_sets").select("*").eq("id", params.id).single(),
      supabase.from("question_sections").select("*").eq("question_set_id", params.id).order("position"),
      supabase.from("questions").select("*").eq("question_set_id", params.id).order("number"),
      supabase.from("lecturers").select("*").order("name"),
    ]);
    setSet(s.data as QuestionSet);
    setSections((sec.data as QuestionSection[]) ?? []);
    setQuestions((q.data as Question[]) ?? []);
    setLecturers((l.data as Lecturer[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const nextNumber = useMemo(
    () => (questions.length ? Math.max(...questions.map((q) => q.number)) + 1 : 1),
    [questions]
  );

  const updateSet = async (patch: Partial<QuestionSet>) => {
    await supabase.from("question_sets").update(patch).eq("id", params.id);
    load();
  };

  const runPreview = (text: string, kind: "paste" | "csv") => {
    setPreview(kind === "paste" ? parseQuestions(text) : parseCsv(text));
  };

  const confirmImport = async () => {
    if (!preview || preview.questions.length === 0) return;
    setImporting(true);
    // Create sections first, map indices to ids.
    const sectionIds: (string | null)[] = [];
    for (let i = 0; i < preview.sections.length; i++) {
      const s = preview.sections[i];
      const { data } = await supabase
        .from("question_sections")
        .insert({
          question_set_id: params.id,
          label: s.label,
          position: sections.length + i,
          scoring: s.scoring,
        })
        .select("id")
        .single();
      sectionIds.push(data?.id ?? null);
    }
    const base = nextNumber - 1;
    const usedNumbers = new Set(questions.map((q) => q.number));
    const rows = preview.questions.map((q, i) => ({
      question_set_id: params.id,
      section_id: q.sectionIndex !== null ? sectionIds[q.sectionIndex] : null,
      number: usedNumbers.has(q.number) ? base + i + 1 : q.number,
      type: q.type,
      body_md: q.body,
      options: q.type === "mcq" ? q.options : null,
      correct_option: q.type === "mcq" ? q.correct : null,
      answer_md: q.answer,
      explanation_md: q.explanation,
      answer_source: "admin" as const,
    }));
    const { error } = await supabase.from("questions").insert(rows);
    setImporting(false);
    if (error) {
      setMessage(`Import failed: ${error.message}`);
      return;
    }
    setMessage(`Imported ${rows.length} questions.`);
    setPasteText("");
    setPreview(null);
    setTab("list");
    load();
  };

  const addSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const isMcq = single.type === "mcq";
    const options = single.options
      .map((text, i) => ({ key: String.fromCharCode(65 + i), text: text.trim() }))
      .filter((o) => o.text);
    const { error } = await supabase.from("questions").insert({
      question_set_id: params.id,
      section_id: single.section_id || null,
      number: nextNumber,
      type: single.type,
      body_md: single.body,
      options: isMcq ? options : null,
      correct_option: isMcq ? single.correct : null,
      answer_md: single.answer || null,
      explanation_md: single.explanation || null,
      answer_source: "admin",
    });
    if (error) {
      setMessage(`Couldn't add the question: ${error.message}`);
      return;
    }
    setSingle({ ...single, body: "", options: ["", "", "", ""], answer: "", explanation: "" });
    setMessage("Question added.");
    load();
  };

  const deduce = async (questionId: string) => {
    setMessage("Deducing from course material…");
    const res = await fetch("/api/ai/deduce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: questionId }),
    });
    const json = await res.json();
    if (json.deduced) setMessage("Answer deduced — review it below, then verify.");
    else if (json.not_covered) setMessage(json.message);
    else setMessage("Deduction failed.");
    load();
  };

  const verify = async (questionId: string) => {
    await supabase.from("questions").update({ answer_source: "verified" }).eq("id", questionId);
    load();
  };

  const removeQuestion = async (questionId: string) => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("questions").delete().eq("id", questionId);
    load();
  };

  if (!set) return <p className="text-ink-deep/50">Loading…</p>;

  return (
    <div>
      <Link href={`/admin/courses/${set.course_id}`} className="text-sm text-ink-deep/60">
        ← Course
      </Link>
      <h1 className="font-display text-2xl mt-2 mb-4">Question set</h1>

      <div className="card p-4 mb-6 flex flex-wrap gap-3 items-center text-sm">
        <span className="capitalize">
          {set.semester} · {set.type} · {set.source}
        </span>
        <select
          className="input !w-44 !py-1.5"
          value={set.lecturer_id ?? ""}
          onChange={(e) => updateSet({ lecturer_id: (e.target.value || null) as any })}
        >
          <option value="">No lecturer</option>
          {lecturers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={set.is_premium}
            onChange={(e) => updateSet({ is_premium: e.target.checked })}
          />
          Premium
        </label>
        <span className="text-ink-deep/50 ml-auto">{questions.length} questions</span>
      </div>

      <div className="flex gap-1 mb-4">
        {(
          [
            ["list", "Questions"],
            ["single", "Add one"],
            ["bulk", "Bulk paste"],
            ["csv", "CSV upload"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold ${
              tab === key ? "bg-ink text-paper" : "text-ink-deep/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <p className="text-sm text-ink-deep/80 mb-4">{message}</p>}

      {tab === "list" && (
        <div className="space-y-3">
          {questions.length === 0 && (
            <p className="text-sm text-ink-deep/50">
              No questions yet — use Bulk paste to import a whole paper at once.
            </p>
          )}
          {questions.map((q) => (
            <div key={q.id} className="card p-4">
              <p className="whitespace-pre-wrap">
                <span className="font-mono font-semibold text-ink mr-2">{q.number}.</span>
                {q.body_md}
              </p>
              {q.options && (
                <ul className="mt-1 text-sm space-y-0.5">
                  {q.options.map((o) => (
                    <li key={o.key} className={o.key === q.correct_option ? "text-mark-right font-medium" : ""}>
                      {o.key}. {o.text}
                    </li>
                  ))}
                </ul>
              )}
              {q.answer_md && (
                <p className="text-sm mt-1 text-mark-right whitespace-pre-wrap">Answer: {q.answer_md}</p>
              )}
              {q.answer_source === "ai_deduced" && (
                <div className="mt-1">
                  <DeducedBadge />
                </div>
              )}
              <div className="flex gap-3 mt-2 text-sm">
                {!q.correct_option && !q.answer_md && (
                  <button className="font-semibold text-ink" onClick={() => deduce(q.id)}>
                    Deduce answer
                  </button>
                )}
                {q.answer_source === "ai_deduced" && (
                  <button className="font-semibold text-mark-right" onClick={() => verify(q.id)}>
                    Mark verified
                  </button>
                )}
                <button className="text-mark-wrong" onClick={() => removeQuestion(q.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "single" && (
        <form onSubmit={addSingle} className="card p-4 space-y-3">
          <div className="flex gap-2">
            <select
              className="input !w-28"
              value={single.type}
              onChange={(e) => setSingle({ ...single, type: e.target.value })}
            >
              <option value="mcq">MCQ</option>
              <option value="theory">Theory</option>
            </select>
            <select
              className="input flex-1"
              value={single.section_id}
              onChange={(e) => setSingle({ ...single, section_id: e.target.value })}
            >
              <option value="">No section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="input min-h-24"
            placeholder={`Question ${nextNumber}`}
            value={single.body}
            onChange={(e) => setSingle({ ...single, body: e.target.value })}
            required
          />
          {single.type === "mcq" && (
            <div className="space-y-2">
              {single.options.map((opt, i) => {
                const key = String.fromCharCode(65 + i);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={single.correct === key}
                      onChange={() => setSingle({ ...single, correct: key })}
                      title="Correct option"
                    />
                    <span className="font-mono text-sm">{key}.</span>
                    <input
                      className="input"
                      placeholder={`Option ${key}`}
                      value={opt}
                      onChange={(e) => {
                        const options = [...single.options];
                        options[i] = e.target.value;
                        setSingle({ ...single, options });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {single.type === "theory" && (
            <textarea
              className="input min-h-20"
              placeholder="Marking-scheme answer (optional — can be deduced later)"
              value={single.answer}
              onChange={(e) => setSingle({ ...single, answer: e.target.value })}
            />
          )}
          <textarea
            className="input min-h-16"
            placeholder="Explanation (optional)"
            value={single.explanation}
            onChange={(e) => setSingle({ ...single, explanation: e.target.value })}
          />
          <button className="btn !w-auto px-6">Add question {nextNumber}</button>
        </form>
      )}

      {tab === "bulk" && (
        <div className="space-y-3">
          <details className="card p-4 text-sm">
            <summary className="font-semibold cursor-pointer">Format guide</summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-ink-deep/70">{FORMAT_GUIDE}</pre>
          </details>
          <textarea
            className="input min-h-64 font-mono text-sm"
            placeholder="Paste the whole paper here…"
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPreview(null);
            }}
          />
          {!preview && (
            <button className="btn !w-auto px-6" onClick={() => runPreview(pasteText, "paste")} disabled={!pasteText.trim()}>
              Preview parse
            </button>
          )}
          {preview && <ImportPreview preview={preview} onConfirm={confirmImport} importing={importing} />}
        </div>
      )}

      {tab === "csv" && (
        <div className="space-y-3">
          <p className="text-sm text-ink-deep/60">
            Columns: number, type (mcq/theory), body, optionA, optionB, optionC, optionD, correct,
            answer, explanation
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              runPreview(await file.text(), "csv");
            }}
          />
          {preview && <ImportPreview preview={preview} onConfirm={confirmImport} importing={importing} />}
        </div>
      )}
    </div>
  );
}

function ImportPreview({
  preview,
  onConfirm,
  importing,
}: {
  preview: ParseResult;
  onConfirm: () => void;
  importing: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="font-semibold">
        {preview.questions.length} question{preview.questions.length === 1 ? "" : "s"} parsed
        {preview.sections.length ? ` · ${preview.sections.length} sections` : ""}
      </p>
      {preview.errors.length > 0 && (
        <ul className="mt-2 text-sm text-mark-wrong list-disc pl-5">
          {preview.errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 max-h-72 overflow-y-auto space-y-2 text-sm">
        {preview.questions.map((q) => (
          <div key={q.number} className="border-b border-paper-line pb-2">
            <p>
              <span className="font-mono text-ink">{q.number}.</span> {q.body}
            </p>
            {q.options.map((o) => (
              <p key={o.key} className={o.key === q.correct ? "text-mark-right" : "text-ink-deep/70"}>
                {o.key}. {o.text}
              </p>
            ))}
            {q.answer && <p className="text-mark-right">ANS: {q.answer}</p>}
          </div>
        ))}
      </div>
      <button className="btn mt-4" onClick={onConfirm} disabled={importing || preview.questions.length === 0}>
        {importing ? "Importing…" : `Confirm import (${preview.questions.length})`}
      </button>
    </div>
  );
}
