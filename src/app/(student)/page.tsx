"use client";

// Home — My Courses. Course stamps, counts, freshness stamp, exam countdown.
// Nearest exam sorts to the top: countdown is the retention feature.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";
import { EmptyState } from "@/components/EmptyState";
import type { Course, UserCourseExam } from "@/lib/types";

type Stats = {
  course_id: string;
  sets_count: number;
  sessions_count: number;
  questions_count: number;
  updated_at: string | null;
};

export default function HomePage() {
  const { loading, userId, profile } = useProfile();
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<Map<string, Stats>>(new Map());
  const [exams, setExams] = useState<Map<string, UserCourseExam>>(new Map());
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: uc } = await supabase
        .from("user_courses")
        .select("course_id, courses(*)")
        .eq("user_id", userId);
      const list = ((uc ?? []).map((r: any) => r.courses).filter(Boolean) as Course[]).sort(
        (a, b) => a.code.localeCompare(b.code)
      );
      setCourses(list);

      const ids = list.map((c) => c.id);
      if (ids.length) {
        const [{ data: statRows }, { data: examRows }] = await Promise.all([
          supabase.from("course_stats").select("*").in("course_id", ids),
          supabase.from("user_course_exams").select("*").eq("user_id", userId),
        ]);
        setStats(new Map((statRows ?? []).map((s: Stats) => [s.course_id, s])));
        setExams(new Map(((examRows ?? []) as UserCourseExam[]).map((e) => [e.course_id, e])));
      }
      setReady(true);
    })();
  }, [userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? courses.filter(
          (c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
        )
      : courses;
    // Nearest upcoming exam first, then course code.
    return [...list].sort((a, b) => {
      const da = daysTo(exams.get(a.id)?.exam_date);
      const db = daysTo(exams.get(b.id)?.exam_date);
      if (da !== null && db !== null) return da - db;
      if (da !== null) return -1;
      if (db !== null) return 1;
      return a.code.localeCompare(b.code);
    });
  }, [courses, query, exams]);

  if (loading) return <PageSkeleton />;

  return (
    <main className="page py-6 fade-in">
      <header className="mb-5">
        <h1 className="font-display text-2xl">My courses</h1>
        {profile?.name && <p className="text-ink-deep/60 text-sm">{profile.name}</p>}
      </header>

      <div className="relative mb-5">
        <Search size={18} className="absolute left-3 top-3.5 text-ink-deep/40" />
        <input
          className="input pl-10"
          placeholder="Search course code or title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {ready && courses.length === 0 && (
        <EmptyState
          title="No courses on your list yet."
          hint="Add your courses below — carryovers and electives included."
        />
      )}

      <div className="space-y-3">
        {filtered.map((c) => {
          const s = stats.get(c.id);
          const exam = exams.get(c.id);
          const days = daysTo(exam?.exam_date);
          return (
            <Link key={c.id} href={`/courses/${c.id}`} className="card block p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Stamp code={c.code} />
                  <p className="font-medium mt-2">{c.title}</p>
                  <p className="text-sm text-ink-deep/60 mt-0.5">
                    {s && s.sets_count > 0
                      ? `${s.sessions_count} session${s.sessions_count === 1 ? "" : "s"} · ${s.questions_count} questions`
                      : "No questions uploaded yet"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {days !== null && days >= 0 && (
                    <span className="inline-block rounded-lg bg-ink text-paper font-mono text-xs px-2 py-1">
                      {days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}
                    </span>
                  )}
                  {s?.updated_at && (
                    <p className="text-xs text-ink-deep/50 mt-2">
                      Updated {formatMonthYear(s.updated_at)}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {ready && courses.length > 0 && filtered.length === 0 && (
        <EmptyState title={`Nothing matches “${query}”.`} hint="Check the course code spelling." />
      )}

      <div className="mt-6 pt-4 rule">
        <Link href="/courses/manage" className="text-ink font-semibold text-sm">
          Manage courses — add carryovers or electives
        </Link>
      </div>
    </main>
  );
}

function daysTo(dateStr?: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  return diff < 0 ? null : diff;
}

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { month: "short", year: "numeric" });
}

function PageSkeleton() {
  return (
    <main className="page py-6">
      <div className="h-8 w-40 bg-paper-line rounded mb-6" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-24 animate-pulse" />
        ))}
      </div>
    </main>
  );
}
