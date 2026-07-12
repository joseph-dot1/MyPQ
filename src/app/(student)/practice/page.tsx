"use client";

// Practice tab: jump straight into a test on any set from your courses.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";
import { FreeBadge, PremiumBadge } from "@/components/Badges";
import { EmptyState } from "@/components/EmptyState";
import type { QuestionSet } from "@/lib/types";

type SetRow = QuestionSet & {
  courses: { code: string; title: string } | null;
  sessions: { name: string } | null;
};

export default function PracticePage() {
  const { userId } = useProfile();
  const [sets, setSets] = useState<SetRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: uc } = await supabase
        .from("user_courses")
        .select("course_id")
        .eq("user_id", userId);
      const ids = (uc ?? []).map((r) => r.course_id);
      if (ids.length) {
        const { data } = await supabase
          .from("question_sets")
          .select("*, courses(code, title), sessions(name)")
          .in("course_id", ids)
          .order("created_at", { ascending: false })
          .limit(100);
        setSets((data as SetRow[]) ?? []);
      }
      setReady(true);
    })();
  }, [userId]);

  return (
    <main className="page py-6 fade-in">
      <h1 className="font-display text-2xl mb-5">Practice</h1>
      {ready && sets.length === 0 && (
        <EmptyState
          title="Nothing to practise yet."
          hint="Question sets for your courses will appear here the moment they're added."
        />
      )}
      <div className="space-y-2">
        {sets.map((s) => (
          <Link key={s.id} href={`/sets/${s.id}/test`} className="card block p-4">
            <div className="flex items-center justify-between">
              <div>
                {s.courses && <Stamp code={s.courses.code} />}
                <p className="text-sm text-ink-deep/70 mt-1.5 capitalize">
                  {s.sessions?.name} · {s.semester} semester{" "}
                  {s.source === "ai" ? "practice set" : s.type === "test" ? "test" : "exam"}
                </p>
              </div>
              {s.is_premium ? <PremiumBadge /> : <FreeBadge />}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
