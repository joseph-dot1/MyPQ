"use client";

// Content manager: Department → Level → Courses tree, plus session management.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Stamp } from "@/components/Stamp";
import type { Course, Level, Session } from "@/lib/types";

export default function ContentPage() {
  const supabase = supabaseBrowser();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [levels, setLevels] = useState<Level[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [newCourse, setNewCourse] = useState<{ level_id: string; code: string; title: string }>({
    level_id: "",
    code: "",
    title: "",
  });
  const [newSession, setNewSession] = useState("");

  const load = async () => {
    const [{ data: dept }, { data: levelRows }, { data: courseRows }, { data: sessionRows }] =
      await Promise.all([
        supabase.from("departments").select("id, name").limit(1).single(),
        supabase.from("levels").select("*").order("position"),
        supabase.from("courses").select("*").order("code"),
        supabase.from("sessions").select("*").order("start_year", { ascending: false }),
      ]);
    if (dept) {
      setDepartmentId(dept.id);
      setDepartmentName(dept.name);
    }
    setLevels((levelRows as Level[]) ?? []);
    setCourses((courseRows as Course[]) ?? []);
    setSessions((sessionRows as Session[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId || !newCourse.level_id || !newCourse.code || !newCourse.title) return;
    await supabase.from("courses").insert({
      department_id: departmentId,
      level_id: newCourse.level_id,
      code: newCourse.code.toUpperCase().trim(),
      title: newCourse.title.trim(),
    });
    setNewCourse({ level_id: newCourse.level_id, code: "", title: "" });
    load();
  };

  const addSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const match = newSession.match(/^(\d{4})\s*\/\s*\d{4}$/);
    if (!match) return;
    await supabase
      .from("sessions")
      .insert({ name: newSession.trim(), start_year: parseInt(match[1], 10) });
    setNewSession("");
    load();
  };

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Content</h1>
      <p className="text-ink-deep/60 text-sm mb-6">{departmentName}</p>

      <section className="card p-4 mb-6">
        <h2 className="font-semibold mb-3">Sessions</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {sessions.map((s) => (
            <span key={s.id} className="font-mono text-sm border border-paper-line rounded px-2 py-1">
              {s.name}
            </span>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-ink-deep/50">No sessions yet — add one below.</p>
          )}
        </div>
        <form onSubmit={addSession} className="flex gap-2">
          <input
            className="input !w-44"
            placeholder="2025/2026"
            value={newSession}
            onChange={(e) => setNewSession(e.target.value)}
          />
          <button className="btn !w-auto px-6">Add session</button>
        </form>
      </section>

      {levels.map((level) => {
        const list = courses.filter((c) => c.level_id === level.id);
        return (
          <section key={level.id} className="mb-6">
            <h2 className="font-mono text-sm text-ink-deep/60 mb-2">{level.name}</h2>
            {list.length === 0 && (
              <p className="text-sm text-ink-deep/50 mb-2">No courses yet for {level.name}.</p>
            )}
            <div className="grid md:grid-cols-2 gap-2">
              {list.map((c) => (
                <Link key={c.id} href={`/admin/courses/${c.id}`} className="card p-3 flex items-center gap-3">
                  <Stamp code={c.code} />
                  <span className="text-sm">{c.title}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Add a course</h2>
        <form onSubmit={addCourse} className="flex flex-wrap gap-2">
          <select
            className="input !w-32"
            value={newCourse.level_id}
            onChange={(e) => setNewCourse({ ...newCourse, level_id: e.target.value })}
            required
          >
            <option value="">Level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            className="input !w-32"
            placeholder="MEC 101"
            value={newCourse.code}
            onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
            required
          />
          <input
            className="input flex-1 min-w-48"
            placeholder="Course title"
            value={newCourse.title}
            onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
            required
          />
          <button className="btn !w-auto px-6">Add course</button>
        </form>
      </section>
    </div>
  );
}
