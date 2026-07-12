"use client";

// Offline layer: opened question sets are stored in IndexedDB so they stay
// readable in airplane mode; test attempts made offline queue locally and
// sync when the connection returns.

import type { Question, QuestionSection, QuestionSet } from "./types";

const DB_NAME = "mypq";
const DB_VERSION = 1;

export type CachedSet = {
  set: QuestionSet & { course_code?: string; session_name?: string };
  sections: QuestionSection[];
  questions: Question[];
  cached_at: number;
};

export type PendingAttempt = {
  local_id: string;
  question_set_id: string;
  mode: "read" | "test";
  score: number;
  total: number;
  duration_s: number;
  answers: { question_id: string; given_answer: string | null; is_correct: boolean | null }[];
  created_at: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sets")) db.createObjectStore("sets");
      if (!db.objectStoreNames.contains("pending_attempts"))
        db.createObjectStore("pending_attempts", { keyPath: "local_id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function cacheSet(data: CachedSet): Promise<void> {
  try {
    await tx("sets", "readwrite", (s) => s.put(data, data.set.id));
  } catch {
    // Storage unavailable (private mode etc.) — the app still works online.
  }
}

export async function getCachedSet(setId: string): Promise<CachedSet | null> {
  try {
    const result = await tx<CachedSet | undefined>("sets", "readonly", (s) => s.get(setId));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function queueAttempt(attempt: PendingAttempt): Promise<void> {
  await tx("pending_attempts", "readwrite", (s) => s.put(attempt));
}

export async function listPendingAttempts(): Promise<PendingAttempt[]> {
  try {
    return await tx<PendingAttempt[]>("pending_attempts", "readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function removePendingAttempt(localId: string): Promise<void> {
  await tx("pending_attempts", "readwrite", (s) => s.delete(localId));
}

// Push queued offline attempts to Supabase. Called on load + on 'online'.
export async function syncPendingAttempts(
  insertAttempt: (a: PendingAttempt) => Promise<boolean>
): Promise<number> {
  const pending = await listPendingAttempts();
  let synced = 0;
  for (const a of pending) {
    try {
      const ok = await insertAttempt(a);
      if (ok) {
        await removePendingAttempt(a.local_id);
        synced++;
      }
    } catch {
      // Still offline or server error — retry next time.
    }
  }
  return synced;
}
