"use client";

// Loads a question set (+ sections + questions), caching it in IndexedDB so
// opened sets stay readable in airplane mode. Falls back to the cache when
// the network is unavailable.

import { useEffect, useState } from "react";
import { supabaseBrowser } from "./supabase/client";
import { cacheSet, getCachedSet } from "./offline";
import type { Question, QuestionSection, QuestionSet } from "./types";

export type LoadedSet = {
  set: (QuestionSet & { course_code?: string; session_name?: string }) | null;
  sections: QuestionSection[];
  questions: Question[];
  fromCache: boolean;
  ready: boolean;
};

export function useQuestionSet(setId: string | undefined): LoadedSet {
  const [state, setState] = useState<LoadedSet>({
    set: null,
    sections: [],
    questions: [],
    fromCache: false,
    ready: false,
  });

  useEffect(() => {
    if (!setId) return;
    let cancelled = false;
    (async () => {
      const supabase = supabaseBrowser();
      try {
        const [{ data: set, error }, { data: sections }, { data: questions }] = await Promise.all([
          supabase
            .from("question_sets")
            .select("*, courses(code), sessions(name)")
            .eq("id", setId)
            .single(),
          supabase.from("question_sections").select("*").eq("question_set_id", setId).order("position"),
          supabase.from("questions").select("*").eq("question_set_id", setId).order("number"),
        ]);
        if (error || !set) throw error ?? new Error("not found");
        if (cancelled) return;

        const enriched = {
          ...(set as QuestionSet),
          course_code: (set as any).courses?.code,
          session_name: (set as any).sessions?.name,
        };
        const loaded: LoadedSet = {
          set: enriched,
          sections: (sections as QuestionSection[]) ?? [],
          questions: (questions as Question[]) ?? [],
          fromCache: false,
          ready: true,
        };
        setState(loaded);
        // Cache for offline revision (free sets and unlocked premium sets —
        // whatever RLS actually returned).
        cacheSet({
          set: enriched,
          sections: loaded.sections,
          questions: loaded.questions,
          cached_at: Date.now(),
        });
      } catch {
        const cached = await getCachedSet(setId);
        if (cancelled) return;
        if (cached) {
          setState({
            set: cached.set,
            sections: cached.sections,
            questions: cached.questions,
            fromCache: true,
            ready: true,
          });
        } else {
          setState((s) => ({ ...s, ready: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setId]);

  return state;
}
