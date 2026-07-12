"use client";

// Lecturers manager: name + style notes (free text — feeds AI generation
// context for lecturer-style practice sets).

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Lecturer } from "@/lib/types";

export default function LecturersPage() {
  const supabase = supabaseBrowser();
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const load = async () => {
    const [{ data: dept }, { data }] = await Promise.all([
      supabase.from("departments").select("id").limit(1).single(),
      supabase.from("lecturers").select("*").order("name"),
    ]);
    if (dept) setDepartmentId(dept.id);
    setLecturers((data as Lecturer[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId || !name.trim()) return;
    await supabase.from("lecturers").insert({ department_id: departmentId, name: name.trim() });
    setName("");
    load();
  };

  const saveNotes = async (id: string) => {
    await supabase.from("lecturers").update({ style_notes: notes }).eq("id", id);
    setEditing(null);
    load();
  };

  return (
    <div>
      <h1 className="font-display text-2xl mb-5">Lecturers</h1>

      <form onSubmit={add} className="flex gap-2 mb-6">
        <input
          className="input flex-1"
          placeholder="e.g. Engr. Okoro"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn !w-auto px-6">Add</button>
      </form>

      {lecturers.length === 0 && <p className="text-sm text-ink-deep/50">No lecturers yet.</p>}

      <div className="space-y-3">
        {lecturers.map((l) => (
          <div key={l.id} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{l.name}</p>
              <button
                className="text-sm font-semibold text-ink"
                onClick={() => {
                  setEditing(editing === l.id ? null : l.id);
                  setNotes(l.style_notes ?? "");
                }}
              >
                {editing === l.id ? "Cancel" : "Style notes"}
              </button>
            </div>
            {editing === l.id ? (
              <div className="mt-2">
                <textarea
                  className="input min-h-24"
                  placeholder="How they set questions: favourite topics, phrasing, marks distribution…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <button className="btn !w-auto px-6 mt-2" onClick={() => saveNotes(l.id)}>
                  Save
                </button>
              </div>
            ) : (
              l.style_notes && <p className="text-sm text-ink-deep/70 mt-1">{l.style_notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
