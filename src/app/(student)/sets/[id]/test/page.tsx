"use client";

// Test mode. Mixed papers are the norm: Section A (objectives) auto-scores,
// Section B (theory) gets guided self-marking against the marking-scheme
// answer, and both combine into ONE result. Works offline: the attempt queues
// in IndexedDB and syncs on reconnect.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { useQuestionSet } from "@/lib/useQuestionSet";
import { useProfile } from "@/lib/useProfile";
import { supabaseBrowser } from "@/lib/supabase/client";
import { queueAttempt } from "@/lib/offline";
import { combineResults, optionTextFor, type CombinedResult, type GivenAnswer } from "@/lib/scoring";
import { Stamp } from "@/components/Stamp";
import { EmptyState } from "@/components/EmptyState";
import type { Question } from "@/lib/types";

type Phase = "setup" | "test" | "selfmark" | "done";

export default function TestModePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { userId, premium } = useProfile();
  const { set, sections, questions, ready } = useQuestionSet(params.id);

  const [phase, setPhase] = useState<Phase>("setup");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, GivenAnswer>>(new Map());
  const [useTimer, setUseTimer] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<CombinedResult | null>(null);
  const [saved, setSaved] = useState<"online" | "offline" | null>(null);
  const startedAt = useRef<number>(0);

  const ordered = useMemo(() => orderQuestions(questions, sections), [questions, sections]);
  const theoryQuestions = useMemo(() => ordered.filter((q) => q.type === "theory"), [ordered]);
  const current = ordered[index];

  // Exit-confirm guard while a test is running.
  useEffect(() => {
    if (phase !== "test" && phase !== "selfmark") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // Countdown timer.
  useEffect(() => {
    if (phase !== "test" || !useTimer) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          finishAnswering();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, useTimer]);

  const setAnswer = (q: Question, patch: Partial<GivenAnswer>) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      const existing = next.get(q.id) ?? { question_id: q.id, given: null, self_mark: null };
      next.set(q.id, { ...existing, ...patch });
      return next;
    });
  };

  const start = () => {
    startedAt.current = Date.now();
    if (useTimer) setSecondsLeft(ordered.length * 60);
    setPhase("test");
  };

  const finishAnswering = () => {
    if (theoryQuestions.length > 0) setPhase("selfmark");
    else finalize();
  };

  const finalize = async () => {
    const list = Array.from(answers.values());
    const combined = combineResults(ordered, sections, list);
    setResult(combined);
    setPhase("done");

    const duration = Math.round((Date.now() - startedAt.current) / 1000);
    const flat = combined.sections.flatMap((s) => s.questions);
    const attemptAnswers = flat.map((r) => ({
      question_id: r.question_id,
      given_answer: r.given,
      is_correct: r.is_correct,
    }));

    const supabase = supabaseBrowser();
    try {
      if (!userId) throw new Error("no user");
      const { data: attempt, error } = await supabase
        .from("attempts")
        .insert({
          user_id: userId,
          question_set_id: params.id,
          mode: "test",
          score: combined.score,
          total: combined.total,
          duration_s: duration,
        })
        .select("id")
        .single();
      if (error || !attempt) throw error;
      await supabase
        .from("attempt_answers")
        .insert(attemptAnswers.map((a) => ({ attempt_id: attempt.id, ...a })));
      setSaved("online");
    } catch {
      await queueAttempt({
        local_id: crypto.randomUUID(),
        question_set_id: params.id,
        mode: "test",
        score: combined.score,
        total: combined.total,
        duration_s: duration,
        answers: attemptAnswers,
        created_at: new Date().toISOString(),
      });
      setSaved("offline");
    }
  };

  if (!ready) return <main className="page py-6" />;
  if (!set || ordered.length === 0) {
    return (
      <main className="page py-6">
        <EmptyState
          title="Nothing to test yet."
          hint="This set has no questions you can practise right now."
        />
        <Link href={set ? `/courses/${set.course_id}` : "/"} className="btn-secondary mt-4">
          Back
        </Link>
      </main>
    );
  }

  const locked = set.is_premium && !premium && ordered.length <= 2;

  // ------ setup ------
  if (phase === "setup") {
    return (
      <main className="page py-6 fade-in">
        <div className="flex items-center gap-2">
          {set.course_code && <Stamp code={set.course_code} />}
          <span className="font-mono text-xs text-ink-deep/60">
            {set.session_name} · {set.semester}
          </span>
        </div>
        <h1 className="font-display text-2xl mt-3">
          {ordered.length} question{ordered.length === 1 ? "" : "s"}
        </h1>
        {locked && (
          <p className="text-sm text-ink-deep/60 mt-1">
            Free preview — the full set is in the semester unlock.
          </p>
        )}
        <label className="flex items-center gap-3 mt-6">
          <input
            type="checkbox"
            checked={useTimer}
            onChange={(e) => setUseTimer(e.target.checked)}
            className="h-5 w-5 accent-[--ink]"
          />
          <span>Timed — 1 minute per question</span>
        </label>
        <button className="btn mt-6" onClick={start}>
          Start test
        </button>
        <Link href={`/sets/${set.id}/read`} className="btn-secondary mt-3">
          Read instead
        </Link>
      </main>
    );
  }

  // ------ answering ------
  if (phase === "test" && current) {
    const given = answers.get(current.id);
    const sectionLabel = sections.find((s) => s.id === current.section_id)?.label;
    return (
      <main className="page py-6 fade-in">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-sm text-ink-deep/60">
            {index + 1} / {ordered.length}
          </span>
          {useTimer && (
            <span
              className={`font-mono text-sm ${secondsLeft < 60 ? "text-mark-wrong timer-pulse" : ""}`}
            >
              {formatTime(secondsLeft)}
            </span>
          )}
        </div>
        <div className="h-1 bg-paper-line rounded-full mb-5">
          <div
            className="h-1 bg-ink rounded-full transition-all"
            style={{ width: `${((index + 1) / ordered.length) * 100}%` }}
          />
        </div>

        {sectionLabel && (
          <p className="font-mono text-xs text-ink-deep/60 mb-2">{sectionLabel}</p>
        )}
        <p className="text-lg whitespace-pre-wrap">
          <span className="font-mono font-semibold text-ink mr-2">{current.number}.</span>
          {current.body_md}
        </p>

        {current.type === "mcq" && current.options && (
          <div className="mt-4 space-y-2">
            {current.options.map((o) => {
              const picked = given?.given === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => setAnswer(current, { given: o.key })}
                  className={`card w-full p-3 text-left flex gap-3 ${
                    picked ? "border-ink bg-white" : ""
                  }`}
                >
                  <span className="font-mono font-semibold text-ink">{o.key}.</span>
                  <span>{o.text}</span>
                </button>
              );
            })}
          </div>
        )}

        {current.type === "theory" && (
          <textarea
            className="input mt-4 min-h-36"
            placeholder="Write your answer — you'll mark it yourself against the marking scheme."
            value={given?.given ?? ""}
            onChange={(e) => setAnswer(current, { given: e.target.value })}
          />
        )}

        <div className="mt-6 flex gap-3">
          {index > 0 && (
            <button className="btn-secondary" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          {index < ordered.length - 1 ? (
            <button className="btn" onClick={() => setIndex(index + 1)}>
              Next
            </button>
          ) : (
            <button className="btn" onClick={finishAnswering}>
              {theoryQuestions.length ? "Mark my answers" : "Show answers"}
            </button>
          )}
        </div>
        <button
          className="mt-4 text-sm text-ink-deep/50 w-full"
          onClick={() => {
            if (confirm("Leave the test? Your answers so far will be lost.")) {
              router.push(`/sets/${set.id}/read`);
            }
          }}
        >
          Exit test
        </button>
      </main>
    );
  }

  // ------ self-marking (Section B) ------
  if (phase === "selfmark") {
    return (
      <main className="page py-6 fade-in">
        <h1 className="font-display text-2xl">Mark your theory answers</h1>
        <p className="text-ink-deep/60 text-sm mt-1">
          Compare each answer with the marking-scheme answer, then award your marks honestly.
        </p>
        <div className="mt-5 space-y-6">
          {theoryQuestions.map((q) => {
            const given = answers.get(q.id);
            return (
              <div key={q.id} className="card p-4">
                <p className="font-medium whitespace-pre-wrap">
                  <span className="font-mono text-ink mr-2">{q.number}.</span>
                  {q.body_md}
                </p>
                <p className="text-sm mt-2 whitespace-pre-wrap">
                  <span className="font-semibold">Your answer: </span>
                  {given?.given?.trim() || <em className="text-ink-deep/50">left blank</em>}
                </p>
                {q.answer_md ? (
                  <p className="text-sm mt-2 text-mark-right whitespace-pre-wrap">
                    <span className="font-semibold">Marking-scheme answer: </span>
                    {q.answer_md}
                  </p>
                ) : (
                  <p className="text-sm mt-2 text-ink-deep/50">
                    No marking-scheme answer recorded — judge it against your handout.
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  {[
                    [0, "Missed it"],
                    [0.5, "Half marks"],
                    [1, "Got it"],
                  ].map(([value, label]) => (
                    <button
                      key={String(value)}
                      onClick={() => setAnswer(q, { self_mark: value as number })}
                      className={`flex-1 min-h-10 rounded-lg border text-sm font-semibold ${
                        given?.self_mark === value
                          ? "border-ink bg-ink text-paper"
                          : "border-paper-line"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button
          className="btn mt-6"
          onClick={finalize}
          disabled={theoryQuestions.some((q) => answers.get(q.id)?.self_mark == null)}
        >
          Show my result
        </button>
      </main>
    );
  }

  // ------ results ------
  if (phase === "done" && result) {
    return (
      <main className="page py-6 fade-in">
        <ScoreHeader score={result.score} total={result.total} />
        {saved === "offline" && (
          <p className="text-xs text-ink-deep/50 text-center mt-1">
            Saved on this phone — it syncs when you&apos;re back online.
          </p>
        )}

        {result.sections.map((s) => (
          <section key={s.label} className="mt-6">
            <h2 className="font-mono text-sm text-ink-deep/60 mb-2">
              {s.label} — {s.score}/{s.total}
            </h2>
            <div className="space-y-4">
              {s.questions.map((r) => {
                const q = ordered.find((x) => x.id === r.question_id)!;
                return (
                  <div key={r.question_id} className="card p-4">
                    <div className="flex gap-2 items-start">
                      {r.is_correct === true && (
                        <Check size={18} className="text-mark-right mt-1 shrink-0" />
                      )}
                      {r.is_correct === false && (
                        <X size={18} className="text-mark-wrong mt-1 shrink-0" />
                      )}
                      <p className="whitespace-pre-wrap">
                        <span className="font-mono text-ink mr-1">{r.number}.</span>
                        {q.body_md}
                      </p>
                    </div>
                    {q.type === "mcq" && (
                      <div className="text-sm mt-2 space-y-1">
                        <p>
                          <span className="font-semibold">You picked: </span>
                          {r.given
                            ? `${r.given}. ${optionTextFor(q, r.given) ?? ""}`
                            : "no answer"}
                        </p>
                        {r.is_correct === false && (
                          <p className="text-mark-right">
                            Not quite. Here&apos;s the marking-scheme answer:{" "}
                            <span className="font-semibold">
                              {q.correct_option}. {optionTextFor(q, q.correct_option)}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                    {q.type === "theory" && q.answer_md && r.is_correct === false && (
                      <p className="text-sm mt-2 text-mark-right whitespace-pre-wrap">
                        Not quite. Here&apos;s the marking-scheme answer: {q.answer_md}
                      </p>
                    )}
                    <ExplainButton questionId={q.id} />
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="mt-8 space-y-3">
          <button
            className="btn"
            onClick={() => {
              setAnswers(new Map());
              setIndex(0);
              setResult(null);
              setPhase("setup");
            }}
          >
            Retake
          </button>
          <Link href={`/courses/${set.course_id}?tab=ai`} className="btn-secondary">
            Try AI variations
          </Link>
        </div>
      </main>
    );
  }

  return <main className="page py-6" />;
}

function ScoreHeader({ score, total }: { score: number; total: number }) {
  // Score count-up — one of the three allowed animations.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(score);
      return;
    }
    let frame = 0;
    const steps = 30;
    const t = setInterval(() => {
      frame++;
      setShown(Math.round((score * frame) / steps * 100) / 100);
      if (frame >= steps) clearInterval(t);
    }, 25);
    return () => clearInterval(t);
  }, [score]);
  return (
    <div className="text-center mt-4">
      <p className="font-display text-6xl text-ink">
        {formatScore(shown)}/{total}
      </p>
      <p className="text-ink-deep/60 mt-1">Combined result</p>
    </div>
  );
}

function ExplainButton({ questionId }: { questionId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const explain = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId }),
      });
      const json = await res.json();
      if (json.explanation) setText(json.explanation);
      else if (json.not_covered) setText(json.message);
      else if (json.error === "premium_required")
        setText("Explanations are part of the semester unlock.");
      else setText("Couldn't fetch an explanation right now.");
    } catch {
      setText("You're offline — explanations need a connection.");
    }
    setBusy(false);
  };
  if (text) return <p className="text-sm text-ink-deep/80 mt-2 whitespace-pre-wrap">{text}</p>;
  return (
    <button onClick={explain} disabled={busy} className="text-sm font-semibold text-ink mt-2">
      {busy ? "Thinking…" : "Explain this"}
    </button>
  );
}

function orderQuestions(
  questions: Question[],
  sections: { id: string; position: number }[]
): Question[] {
  const pos = new Map(sections.map((s) => [s.id, s.position]));
  return [...questions].sort((a, b) => {
    const pa = a.section_id ? pos.get(a.section_id) ?? 99 : 99;
    const pb = b.section_id ? pos.get(b.section_id) ?? 99 : 99;
    if (pa !== pb) return pa - pb;
    return a.number - b.number;
  });
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
