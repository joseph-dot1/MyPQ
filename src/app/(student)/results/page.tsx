"use client";

// Results history: attempts by course, date, score trend as a plain SVG
// sparkline (no chart library).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState } from "@/components/EmptyState";
import type { Attempt } from "@/lib/types";

type AttemptRow = Attempt & {
  question_sets: { course_id: string; courses: { code: string; title: string } | null } | null;
};

export default function ResultsPage() {
  const { userId } = useProfile();
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase
        .from("attempts")
        .select("*, question_sets(course_id, courses(code, title))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      setAttempts((data as AttemptRow[]) ?? []);
      setReady(true);
    })();
  }, [userId]);

  const byCourse = useMemo(() => {
    const map = new Map<string, { code: string; title: string; attempts: AttemptRow[] }>();
    for (const a of attempts) {
      const code = a.question_sets?.courses?.code ?? "—";
      const title = a.question_sets?.courses?.title ?? "";
      if (!map.has(code)) map.set(code, { code, title, attempts: [] });
      map.get(code)!.attempts.push(a);
    }
    return Array.from(map.values());
  }, [attempts]);

  return (
    <main className="page py-6 fade-in">
      <h1 className="font-display text-2xl mb-5">Results</h1>

      {ready && attempts.length === 0 && (
        <EmptyState
          title="No test results yet."
          hint="Finish a test and your scores start tracking here."
        />
      )}

      {byCourse.map((group) => {
        // Oldest → newest for the trend line.
        const trend = [...group.attempts]
          .reverse()
          .map((a) => (a.total > 0 ? (a.score / a.total) * 100 : 0));
        return (
          <section key={group.code} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <Stamp code={group.code} />
              <Sparkline values={trend} />
            </div>
            <div className="space-y-2">
              {group.attempts.map((a) => (
                <Link key={a.id} href={`/results/${a.id}`} className="card flex items-center justify-between p-3">
                  <div>
                    <p className="font-mono font-semibold text-ink">
                      {formatScore(a.score)}/{a.total}
                    </p>
                    <p className="text-xs text-ink-deep/60">
                      {new Date(a.created_at).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {a.duration_s > 0 ? ` · ${Math.round(a.duration_s / 60)} min` : ""}
                    </p>
                  </div>
                  <span className="text-sm text-ink font-semibold">Review</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
