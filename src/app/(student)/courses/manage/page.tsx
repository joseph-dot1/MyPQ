"use client";

// Manage courses: add carryovers/electives from any level, remove courses.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";
import { EmptyState } from "@/components/EmptyState";
import type { Course, Level } from "@/lib/types";

export default function ManageCoursesPage() {
  const { userId } = useProfile();
  const [all, setAll] = useState<Course[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const supabase = supabaseBrowser();
      const [{ data: courses }, { data: levelRows }, { data: uc }] = await Promise.all([
        supabase.from("courses").select("*").order("code"),
        supabase.from("levels").select("*").order("position"),
        supabase.from("user_courses").select("course_id").eq("user_id", userId),
      ]);
      setAll((courses as Course[]) ?? []);
      setLevels((levelRows as Level[]) ?? []);
      setMine(new Set((uc ?? []).map((r) => r.course_id)));
      setReady(true);
    })();
  }, [userId]);

  const toggle = async (courseId: string) => {
    if (!userId) return;
    const supabase = supabaseBrowser();
    const next = new Set(mine);
    if (next.has(courseId)) {
      next.delete(courseId);
      setMine(next);
      await supabase.from("user_courses").delete().eq("user_id", userId).eq("course_id", courseId);
    } else {
      next.add(courseId);
      setMine(next);
      await supabase.from("user_courses").upsert({ user_id: userId, course_id: courseId });
    }
  };

  return (
    <main className="page py-6 fade-in">
      <Link href="/" className="text-sm text-ink-deep/60">
        ← My courses
      </Link>
      <h1 className="font-display text-2xl mt-2 mb-5">Manage courses</h1>

      {ready && all.length === 0 && (
        <EmptyState
          title="No courses have been added yet."
          hint="They'll appear here the moment they're added."
        />
      )}

      {levels.map((level) => {
        const list = all.filter((c) => c.level_id === level.id);
        if (!list.length) return null;
        return (
          <section key={level.id} className="mb-6">
            <h2 className="font-mono text-sm text-ink-deep/60 mb-2">{level.name}</h2>
            <div className="space-y-2">
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`card w-full p-3 flex items-center justify-between text-left ${
                    mine.has(c.id) ? "border-ink" : ""
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Stamp code={c.code} />
                    <span className="text-sm">{c.title}</span>
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {mine.has(c.id) ? "Remove" : "Add"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
