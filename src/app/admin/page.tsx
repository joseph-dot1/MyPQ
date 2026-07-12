"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Stats = {
  signups: number;
  active7d: number;
  premium: number;
  revenueKobo: number;
  aiCalls: number;
  aiTokens: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [users, active, premium, subs, ai] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase
          .from("attempts")
          .select("user_id", { count: "exact", head: true })
          .gte("created_at", sevenDaysAgo),
        supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString()),
        supabase.from("subscriptions").select("amount"),
        supabase.from("ai_generations").select("tokens_in, tokens_out"),
      ]);
      setStats({
        signups: users.count ?? 0,
        active7d: active.count ?? 0,
        premium: premium.count ?? 0,
        revenueKobo: (subs.data ?? []).reduce((s, r) => s + r.amount, 0),
        aiCalls: (ai.data ?? []).length,
        aiTokens: (ai.data ?? []).reduce((s, r) => s + r.tokens_in + r.tokens_out, 0),
      });
    })();
  }, []);

  if (!stats) return <p className="text-ink-deep/50">Loading…</p>;

  const cards = [
    ["Signups", stats.signups.toLocaleString()],
    ["Attempts (7d)", stats.active7d.toLocaleString()],
    ["Active unlocks", stats.premium.toLocaleString()],
    ["Revenue", `₦${(stats.revenueKobo / 100).toLocaleString()}`],
    ["AI calls", stats.aiCalls.toLocaleString()],
    ["AI tokens (≈cost proxy)", stats.aiTokens.toLocaleString()],
  ];

  return (
    <div>
      <h1 className="font-display text-2xl mb-5">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="font-mono text-2xl font-semibold text-ink">{value}</p>
            <p className="text-sm text-ink-deep/60">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
