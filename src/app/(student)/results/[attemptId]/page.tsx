"use client";

// Attempt review from history: big score, per-question tick/cross list.
// The option shown for "You picked" resolves through the stable option key —
// exactly what the student tapped.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { optionTextFor } from "@/lib/scoring";
import { Stamp } from "@/components/Stamp";
import { EmptyState } from "@/components/EmptyState";
import type { Attempt, Question } from "@/lib/types";

type AnswerRow = { question_id: string; given_answer: string | null; is_correct: boolean | null };

export default function AttemptReviewPage() {
  const params = useParams<{ attemptId: string }>();
  const { userId } = useProfile();
  const [attempt, setAttempt] = useState<(Attempt & { question_sets: any }) | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Map<string, AnswerRow>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: a } = await supabase
        .from("attempts")
        .select("*, question_sets(course_id, courses(code))")
        .eq("id", params.attemptId)
        .maybeSingle();
      if (a) {
        const [{ data: qs }, { data: ans }] = await Promise.all([
          supabase.from("questions").select("*").eq("question_set_id", a.question_set_id).order("number"),
          supabase.from("attempt_answers").select("*").eq("attempt_id", a.id),
        ]);
        setAttempt(a as any);
        setQuestions((qs as Question[]) ?? []);
        setAnswers(new Map(((ans as AnswerRow[]) ?? []).map((r) => [r.question_id, r])));
      }
      setReady(true);
    })();
  }, [userId, params.attemptId]);

  if (!ready) return <main className="page py-6" />;
  if (!attempt) {
    return (
      <main className="page py-6">
        <EmptyState title="This result isn't available." />
      </main>
    );
  }

  const code = attempt.question_sets?.courses?.code;

  return (
    <main className="page py-6 fade-in">
      <Link href="/results" className="text-sm text-ink-deep/60">
        ← Results
      </Link>
      <div className="text-center mt-4">
        {code && <Stamp code={code} />}
        <p className="font-display text-6xl text-ink mt-3">
          {formatScore(attempt.score)}/{attempt.total}
        </p>
        <p className="text-ink-deep/60 text-sm mt-1">
          {new Date(attempt.created_at).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          {attempt.duration_s > 0 ? ` · ${Math.round(attempt.duration_s / 60)} min` : ""}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {questions.map((q) => {
          const ans = answers.get(q.id);
          return (
            <div key={q.id} className="card p-4">
              <div className="flex gap-2 items-start">
                {ans?.is_correct === true && (
                  <Check size={18} className="text-mark-right mt-1 shrink-0" />
                )}
                {ans?.is_correct === false && (
                  <X size={18} className="text-mark-wrong mt-1 shrink-0" />
                )}
                <p className="whitespace-pre-wrap">
                  <span className="font-mono text-ink mr-1">{q.number}.</span>
                  {q.body_md}
                </p>
              </div>
              {q.type === "mcq" && (
                <div className="text-sm mt-2 space-y-1">
                  <p>
                    <span className="font-semibold">You picked: </span>
                    {ans?.given_answer
                      ? `${ans.given_answer}. ${optionTextFor(q, ans.given_answer) ?? ""}`
                      : "no answer"}
                  </p>
                  {ans?.is_correct === false && q.correct_option && (
                    <p className="text-mark-right">
                      Not quite. Here&apos;s the marking-scheme answer:{" "}
                      <span className="font-semibold">
                        {q.correct_option}. {optionTextFor(q, q.correct_option)}
                      </span>
                    </p>
                  )}
                </div>
              )}
              {q.type === "theory" && q.answer_md && (
                <p className="text-sm mt-2 text-mark-right whitespace-pre-wrap">
                  Marking-scheme answer: {q.answer_md}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Link href={`/sets/${attempt.question_set_id}/test`} className="btn mt-8">
        Retake
      </Link>
    </main>
  );
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
