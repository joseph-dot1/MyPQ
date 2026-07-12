"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "./supabase/client";
import type { Profile } from "./types";

export type ProfileState = {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  premium: boolean;
  refresh: () => void;
};

// Client-side session/profile loader. This only drives UX (redirects, badges);
// real gating is Postgres RLS + server routes.
export function useProfile(options?: { requireOnboarded?: boolean }): ProfileState {
  const router = useRouter();
  const [state, setState] = useState<Omit<ProfileState, "refresh">>({
    loading: true,
    userId: null,
    profile: null,
    premium: false,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from("users").select("*").eq("id", user.id).single(),
        supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString()),
      ]);
      if (cancelled) return;
      if (options?.requireOnboarded !== false && (!profile?.level_id || !profile?.name)) {
        router.replace("/onboarding");
        return;
      }
      setState({
        loading: false,
        userId: user.id,
        profile: (profile as Profile) ?? null,
        premium: (count ?? 0) > 0,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
