"use client";

// Admin course page: question sets (create with metadata) + materials upload
// with auto text-extraction for AI grounding.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Stamp } from "@/components/Stamp";
import { FreeBadge, PremiumBadge } from "@/components/Badges";
import type { Course, Lecturer, Material, QuestionSet, Session } from "@/lib/types";

export default function AdminCoursePage() {
  const params = useParams<{ id: string }>();
  const supabase = supabaseBrowser();

  const [course, setCourse] = useState<Course | null>(null);
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [form, setForm] = useState({
    session_id: "",
    semester: "First",
    type: "exam",
    lecturer_id: "",
    is_premium: false,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadLecturer, setUploadLecturer] = useState("");
  const [uploadPremium, setUploadPremium] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [c, s, se, l, m] = await Promise.all([
      supabase.from("courses").select("*").eq("id", params.id).single(),
      supabase
        .from("question_sets")
        .select("*")
        .eq("course_id", params.id)
        .order("created_at", { ascending: false }),
      supabase.from("sessions").select("*").order("start_year", { ascending: false }),
      supabase.from("lecturers").select("*").order("name"),
      supabase.from("materials").select("*").eq("course_id", params.id).order("created_at", { ascending: false }),
    ]);
    setCourse(c.data as Course);
    setSets((s.data as QuestionSet[]) ?? []);
    setSessions((se.data as Session[]) ?? []);
    setLecturers((l.data as Lecturer[]) ?? []);
    setMaterials((m.data as Material[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const createSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.session_id) return;
    const { data } = await supabase
      .from("question_sets")
      .insert({
        course_id: params.id,
        session_id: form.session_id,
        semester: form.semester,
        type: form.type,
        lecturer_id: form.lecturer_id || null,
        is_premium: form.is_premium,
        source: "admin",
      })
      .select("id")
      .single();
    if (data) window.location.href = `/admin/sets/${data.id}`;
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    const path = `${params.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("materials").upload(path, file);
    if (error) {
      setMessage("Upload failed — try again.");
      setUploading(false);
      return;
    }
    const { data: material } = await supabase
      .from("materials")
      .insert({
        course_id: params.id,
        lecturer_id: uploadLecturer || null,
        title: uploadTitle || file.name,
        file_url: path,
        is_premium: uploadPremium,
      })
      .select("id")
      .single();
    // Kick off text extraction for AI grounding.
    if (material) {
      const res = await fetch("/api/admin/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: material.id }),
      });
      const json = await res.json();
      if (json.status === "extracted") setMessage(`Uploaded — ${json.chunks} text chunks stored for AI grounding.`);
      else if (json.status === "needs_ocr")
        setMessage("Uploaded — looks like a scan; OCR isn't wired up yet, so the AI can't read it.");
      else setMessage("Uploaded, but text extraction failed.");
    }
    setUploadTitle("");
    setUploading(false);
    load();
  };

  if (!course) return <p className="text-ink-deep/50">Loading…</p>;

  const sessionName = (id: string) => sessions.find((s) => s.id === id)?.name ?? "";
  const lecturerName = (id: string | null) => lecturers.find((l) => l.id === id)?.name ?? "";

  return (
    <div>
      <Link href="/admin/content" className="text-sm text-ink-deep/60">
        ← Content
      </Link>
      <div className="flex items-center gap-3 mt-2 mb-6">
        <Stamp code={course.code} />
        <h1 className="font-display text-2xl">{course.title}</h1>
      </div>

      <section className="mb-8">
        <h2 className="font-semibold mb-3">Question sets</h2>
        {sets.length === 0 && <p className="text-sm text-ink-deep/50 mb-3">No sets yet.</p>}
        <div className="space-y-2 mb-4">
          {sets.map((s) => (
            <Link key={s.id} href={`/admin/sets/${s.id}`} className="card p-3 flex items-center justify-between">
              <span className="text-sm">
                {sessionName(s.session_id)} · {s.semester} · {s.type}
                {s.lecturer_id ? ` · ${lecturerName(s.lecturer_id)}` : ""}
                {s.source === "ai" ? " · AI" : ""}
              </span>
              {s.is_premium ? <PremiumBadge /> : <FreeBadge />}
            </Link>
          ))}
        </div>

        <form onSubmit={createSet} className="card p-4 flex flex-wrap gap-2 items-center">
          <select
            className="input !w-36"
            value={form.session_id}
            onChange={(e) => setForm({ ...form, session_id: e.target.value })}
            required
          >
            <option value="">Session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="input !w-28"
            value={form.semester}
            onChange={(e) => setForm({ ...form, semester: e.target.value })}
          >
            <option>First</option>
            <option>Second</option>
          </select>
          <select
            className="input !w-24"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="exam">Exam</option>
            <option value="test">Test</option>
          </select>
          <select
            className="input !w-44"
            value={form.lecturer_id}
            onChange={(e) => setForm({ ...form, lecturer_id: e.target.value })}
          >
            <option value="">No lecturer</option>
            {lecturers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_premium}
              onChange={(e) => setForm({ ...form, is_premium: e.target.checked })}
            />
            Premium
          </label>
          <button className="btn !w-auto px-6">Create set</button>
        </form>
      </section>

      <section>
        <h2 className="font-semibold mb-3">Materials</h2>
        {materials.length === 0 && <p className="text-sm text-ink-deep/50 mb-3">No handouts yet.</p>}
        <div className="space-y-2 mb-4">
          {materials.map((m) => (
            <div key={m.id} className="card p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-xs text-ink-deep/60">
                  extraction: {m.extracted_text_status}
                  {m.lecturer_id ? ` · ${lecturerName(m.lecturer_id)}` : ""}
                </p>
              </div>
              {m.is_premium ? <PremiumBadge /> : <FreeBadge />}
            </div>
          ))}
        </div>

        <div className="card p-4 space-y-2">
          <input
            className="input"
            placeholder="Material title (defaults to file name)"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="input !w-44"
              value={uploadLecturer}
              onChange={(e) => setUploadLecturer(e.target.value)}
            >
              <option value="">No lecturer</option>
              {lecturers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={uploadPremium}
                onChange={(e) => setUploadPremium(e.target.checked)}
              />
              Premium
            </label>
            <input type="file" accept=".pdf,.txt,.md,image/*" onChange={upload} disabled={uploading} />
            {uploading && <span className="text-sm text-ink-deep/60">Uploading…</span>}
          </div>
          {message && <p className="text-sm text-ink-deep/70">{message}</p>}
        </div>
      </section>
    </div>
  );
}
