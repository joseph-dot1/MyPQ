"use client";

// Course page. Tabs: Past Questions (grouped by session, newest first) ·
// Materials · AI Practice (premium). Header carries the Stamp + exam date.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";
import { FreeBadge, PremiumBadge } from "@/components/Badges";
import { EmptyState } from "@/components/EmptyState";
import type { Course, Lecturer, Material, QuestionSet, Session } from "@/lib/types";

type Tab = "past" | "materials" | "ai";

export default function CoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const router = useRouter();
  const { userId, premium } = useProfile();

  const [course, setCourse] = useState<Course | null>(null);
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  const [lecturers, setLecturers] = useState<Map<string, Lecturer>>(new Map());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [materials, setMaterials] = useState<Material[]>([]);
  const [examDate, setExamDate] = useState<string>("");
  const [tab, setTab] = useState<Tab>("past");
  const [ready, setReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !courseId) return;
    (async () => {
      const supabase = supabaseBrowser();
      const [
        { data: courseRow },
        { data: setRows },
        { data: sessionRows },
        { data: lecturerRows },
        { data: materialRows },
        { data: examRow },
      ] = await Promise.all([
        supabase.from("courses").select("*").eq("id", courseId).single(),
        supabase
          .from("question_sets")
          .select("*")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false }),
        supabase.from("sessions").select("*"),
        supabase.from("lecturers").select("*"),
        supabase.from("materials").select("*").eq("course_id", courseId).order("created_at", { ascending: false }),
        supabase
          .from("user_course_exams")
          .select("*")
          .eq("user_id", userId)
          .eq("course_id", courseId)
          .maybeSingle(),
      ]);
      setCourse(courseRow as Course);
      const allSets = (setRows as QuestionSet[]) ?? [];
      setSets(allSets);
      setSessions(new Map(((sessionRows as Session[]) ?? []).map((s) => [s.id, s])));
      setLecturers(new Map(((lecturerRows as Lecturer[]) ?? []).map((l) => [l.id, l])));
      setMaterials((materialRows as Material[]) ?? []);
      if (examRow?.exam_date) setExamDate(examRow.exam_date);

      // Question counts per set (RLS may hide premium questions; counts come
      // from the metadata-safe head count on questions the user can see, so
      // show set counts from an aggregate query instead).
      if (allSets.length) {
        const results = await Promise.all(
          allSets.map((s) =>
            supabase
              .from("questions")
              .select("id", { count: "exact", head: true })
              .eq("question_set_id", s.id)
              .then(({ count }) => [s.id, count ?? 0] as const)
          )
        );
        setCounts(new Map(results));
      }
      setReady(true);
    })();
  }, [userId, courseId]);

  const saveExamDate = async (value: string) => {
    setExamDate(value);
    if (!userId) return;
    const supabase = supabaseBrowser();
    if (value) {
      await supabase
        .from("user_course_exams")
        .upsert({ user_id: userId, course_id: courseId, exam_type: "exam", exam_date: value });
    } else {
      await supabase
        .from("user_course_exams")
        .delete()
        .eq("user_id", userId)
        .eq("course_id", courseId);
    }
  };

  const pastSets = useMemo(() => {
    const grouped = new Map<string, QuestionSet[]>();
    for (const s of sets.filter((s) => s.source === "admin")) {
      const key = s.session_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }
    return Array.from(grouped.entries()).sort(
      (a, b) => (sessions.get(b[0])?.start_year ?? 0) - (sessions.get(a[0])?.start_year ?? 0)
    );
  }, [sets, sessions]);

  const aiSets = useMemo(() => sets.filter((s) => s.source === "ai"), [sets]);

  const generate = async () => {
    setGenerating(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: courseId }),
      });
      const json = await res.json();
      if (res.ok && json.set_id) {
        router.push(`/sets/${json.set_id}/read`);
      } else if (json.not_covered) {
        setAiMessage(json.message);
      } else if (json.error === "no_premium") {
        setAiMessage("AI practice is part of the semester unlock.");
      } else if (json.error === "quota_exhausted") {
        setAiMessage("You've used this month's included generations. Referral credits buy extras.");
      } else {
        setAiMessage("Couldn't generate a practice set. Try again in a moment.");
      }
    } catch {
      setAiMessage("You're offline — AI practice needs a connection.");
    }
    setGenerating(false);
  };

  if (!course) return <main className="page py-6">{ready ? "Course not found." : ""}</main>;

  return (
    <main className="page py-6 fade-in">
      <Link href="/" className="text-sm text-ink-deep/60">
        ← My courses
      </Link>

      <header className="mt-3 mb-4">
        <Stamp code={course.code} />
        <h1 className="font-display text-2xl mt-2">{course.title}</h1>
        <label className="flex items-center gap-2 mt-3 text-sm text-ink-deep/70">
          Exam date
          <input
            type="date"
            className="input !w-auto !py-1.5 text-sm"
            value={examDate}
            onChange={(e) => saveExamDate(e.target.value)}
          />
        </label>
      </header>

      <div className="flex gap-1 rule pt-3 mb-4">
        {(
          [
            ["past", "Past Questions"],
            ["materials", "Materials"],
            ["ai", "AI Practice"],
          ] as [Tab, string][]
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

      {tab === "past" && (
        <section>
          {ready && pastSets.length === 0 && (
            <EmptyState
              title={`No questions uploaded yet for ${course.code}.`}
              hint="They'll appear here the moment they're added."
            />
          )}
          {pastSets.map(([sessionId, list]) => (
            <div key={sessionId} className="mb-5">
              <h2 className="font-mono text-sm text-ink-deep/60 mb-2">
                {sessions.get(sessionId)?.name ?? "Session"}
              </h2>
              <div className="space-y-2">
                {list.map((s) => (
                  <Link key={s.id} href={`/sets/${s.id}/read`} className="card block p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium capitalize">
                          {s.semester} semester {s.type === "test" ? "test" : "exam"}
                        </p>
                        <p className="text-sm text-ink-deep/60">
                          {s.lecturer_id ? `${lecturers.get(s.lecturer_id)?.name ?? ""} · ` : ""}
                          {counts.get(s.id) ?? 0} questions
                        </p>
                      </div>
                      {s.is_premium ? <PremiumBadge /> : <FreeBadge />}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "materials" && (
        <section>
          {ready && materials.length === 0 && (
            <EmptyState
              title={`No handouts uploaded yet for ${course.code}.`}
              hint="They'll appear here the moment they're added."
            />
          )}
          <div className="space-y-2">
            {materials.map((m) => (
              <MaterialRow key={m.id} material={m} />
            ))}
          </div>
        </section>
      )}

      {tab === "ai" && (
        <section>
          {!premium && (
            <div className="card p-4 mb-4">
              <p className="font-medium">AI practice is part of the semester unlock.</p>
              <p className="text-sm text-ink-deep/60 mt-1">
                Grounded in your uploaded course material — practice, in your lecturer&apos;s style.
              </p>
              <Link href="/premium" className="btn mt-3">
                Unlock full archive
              </Link>
            </div>
          )}
          {premium && (
            <button className="btn mb-4" onClick={generate} disabled={generating}>
              {generating ? "Generating…" : "Generate new practice set"}
            </button>
          )}
          {aiMessage && <p className="text-sm text-ink-deep/70 mb-4">{aiMessage}</p>}
          {ready && aiSets.length === 0 && premium && (
            <EmptyState
              title="No practice sets generated yet."
              hint="Generate one — it stays saved here for revision."
            />
          )}
          <div className="space-y-2">
            {aiSets.map((s) => (
              <Link key={s.id} href={`/sets/${s.id}/read`} className="card block p-4">
                <p className="font-medium">Practice set</p>
                <p className="text-sm text-ink-deep/60">
                  {new Date(s.created_at).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {s.lecturer_id
                    ? ` · in the style of ${lecturers.get(s.lecturer_id)?.name ?? "your lecturer"}`
                    : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function MaterialRow({ material }: { material: Material }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const supabase = supabaseBrowser();
    const { data } = await supabase.storage.from("materials").createSignedUrl(material.file_url, 3600);
    setBusy(false);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  return (
    <button onClick={open} disabled={busy} className="card w-full p-4 text-left flex items-center justify-between">
      <div>
        <p className="font-medium">{material.title}</p>
        <p className="text-sm text-ink-deep/60">Tap to read or download</p>
      </div>
      {material.is_premium ? <PremiumBadge /> : <FreeBadge />}
    </button>
  );
}
