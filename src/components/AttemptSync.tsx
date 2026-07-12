"use client";

// Syncs offline test attempts (queued in IndexedDB) to Supabase whenever the
// app loads or the connection comes back.

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { syncPendingAttempts, type PendingAttempt } from "@/lib/offline";

async function pushAttempt(a: PendingAttempt): Promise<boolean> {
  const supabase = supabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: attempt, error } = await supabase
    .from("attempts")
    .insert({
      user_id: user.id,
      question_set_id: a.question_set_id,
      mode: a.mode,
      score: a.score,
      total: a.total,
      duration_s: a.duration_s,
      created_at: a.created_at,
    })
    .select("id")
    .single();
  if (error || !attempt) return false;

  if (a.answers.length) {
    await supabase
      .from("attempt_answers")
      .insert(a.answers.map((ans) => ({ attempt_id: attempt.id, ...ans })));
  }
  return true;
}

export function AttemptSync() {
  useEffect(() => {
    const sync = () => {
      syncPendingAttempts(pushAttempt).catch(() => {});
    };
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, []);
  return null;
}
