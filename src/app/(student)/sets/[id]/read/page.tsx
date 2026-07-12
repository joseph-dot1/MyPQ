"use client";

// Read mode: clean numbered list, answers + explanations inline, correct MCQ
// option marked in --mark-right. Premium sets show a locked preview (first 2
// questions, enforced by RLS) + unlock CTA.

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check } from "lucide-react";
import { useQuestionSet } from "@/lib/useQuestionSet";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";
import { DeducedBadge } from "@/components/Badges";
import { EmptyState } from "@/components/EmptyState";
import type { Question } from "@/lib/types";

export default function ReadModePage() {
  const params = useParams<{ id: string }>();
  const { premium } = useProfile();
  const { set, sections, questions, ready, fromCache } = useQuestionSet(params.id);

  if (!ready) return <main className="page py-6" />;
  if (!set)
    return (
      <main className="page py-6">
        <EmptyState title="This set isn't available." hint="Open it once online to keep it offline." />
      </main>
    );

  const locked = set.is_premium && !premium;
  const bySection = groupBySection(questions, sections);

  return (
    <main className="page py-6 fade-in">
      <div className="sticky top-0 bg-paper py-2 -mx-5 px-5 border-b border-paper-line z-30">
        <div className="flex items-center justify-between">
          <Link href={`/courses/${set.course_id}`} className="text-sm text-ink-deep/60">
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            {set.course_code && <Stamp code={set.course_code} />}
            <span className="font-mono text-xs text-ink-deep/60">
              {set.session_name} · {set.semester}
            </span>
          </div>
        </div>
      </div>

      {fromCache && (
        <p className="text-xs text-ink-deep/50 mt-3">Saved copy — you&apos;re reading offline.</p>
      )}

      {questions.length === 0 && (
        <EmptyState
          title="No questions in this set yet."
          hint="They'll appear here the moment they're added."
        />
      )}

      {bySection.map(({ label, items }) => (
        <section key={label ?? "all"} className="mt-6">
          {label && <h2 className="font-mono text-sm text-ink-deep/60 mb-3">{label}</h2>}
          <div className="space-y-6">
            {items.map((q) => (
              <ReadQuestion key={q.id} q={q} />
            ))}
          </div>
        </section>
      ))}

      {locked && (
        <div className="card p-5 mt-8 text-center">
          <p className="font-medium">That&apos;s the free preview.</p>
          <p className="text-sm text-ink-deep/60 mt-1">
            Unlock the full archive for the whole semester — pay once, use all semester.
          </p>
          <Link href="/premium" className="btn mt-4">
            Unlock full archive
          </Link>
        </div>
      )}

      {!locked && questions.length > 0 && (
        <div className="mt-8 space-y-3">
          <Link href={`/sets/${set.id}/test`} className="btn">
            Start test
          </Link>
        </div>
      )}
    </main>
  );
}

function ReadQuestion({ q }: { q: Question }) {
  const [explaining, setExplaining] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);

  const explain = async () => {
    setExplaining(true);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: q.id }),
      });
      const json = await res.json();
      if (json.explanation) setAiText(json.explanation);
      else if (json.not_covered) setAiText(json.message);
      else if (json.error === "premium_required")
        setAiText("Explanations are part of the semester unlock.");
      else setAiText("Couldn't fetch an explanation right now.");
    } catch {
      setAiText("You're offline — explanations need a connection.");
    }
    setExplaining(false);
  };

  const unanswered = !q.correct_option && !q.answer_md;

  return (
    <article>
      <p className="whitespace-pre-wrap">
        <span className="font-mono font-semibold text-ink mr-2">{q.number}.</span>
        {q.body_md}
      </p>
      {q.options && (
        <ul className="mt-2 space-y-1.5">
          {q.options.map((o) => {
            const correct = q.correct_option === o.key;
            return (
              <li
                key={o.key}
                className={`flex gap-2 text-[15px] ${correct ? "text-mark-right font-medium" : ""}`}
              >
                <span className="font-mono">{o.key}.</span>
                <span>{o.text}</span>
                {correct && <Check size={16} className="mt-1 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
      {q.answer_md && (
        <p className="mt-2 text-[15px] text-mark-right whitespace-pre-wrap">
          <span className="font-semibold">Answer: </span>
          {q.answer_md}
        </p>
      )}
      {unanswered && (
        <p className="mt-2 text-sm text-ink-deep/50">No answer recorded for this one yet.</p>
      )}
      {q.answer_source === "ai_deduced" && (
        <div className="mt-1.5">
          <DeducedBadge />
        </div>
      )}
      {q.explanation_md && (
        <p className="mt-1.5 text-sm text-ink-deep/70 whitespace-pre-wrap">{q.explanation_md}</p>
      )}
      {aiText && <p className="mt-2 text-sm text-ink-deep/80 whitespace-pre-wrap">{aiText}</p>}
      {!aiText && !q.explanation_md && !unanswered && (
        <button onClick={explain} disabled={explaining} className="mt-2 text-sm font-semibold text-ink">
          {explaining ? "Thinking…" : "Explain this"}
        </button>
      )}
    </article>
  );
}

function groupBySection(
  questions: Question[],
  sections: { id: string; label: string; position: number }[]
) {
  const out: { label: string | null; items: Question[] }[] = [];
  const ordered = [...sections].sort((a, b) => a.position - b.position);
  for (const s of ordered) {
    const items = questions.filter((q) => q.section_id === s.id);
    if (items.length) out.push({ label: s.label, items });
  }
  const loose = questions.filter((q) => !q.section_id || !sections.some((s) => s.id === q.section_id));
  if (loose.length) out.push({ label: out.length ? "Other questions" : null, items: loose });
  return out;
}
