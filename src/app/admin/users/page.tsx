"use client";

// Users & payments: search, premium status, manual grant (provider='manual'),
// credits adjustment, rep flagging.

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const PRICE_NAIRA = process.env.NEXT_PUBLIC_SEMESTER_PRICE_NAIRA || "1000";

export default function UsersPage() {
  const supabase = supabaseBrowser();
  const [users, setUsers] = useState<Profile[]>([]);
  const [premiumIds, setPremiumIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    let q = supabase.from("users").select("*").order("created_at", { ascending: false }).limit(50);
    if (query.trim()) {
      q = supabase
        .from("users")
        .select("*")
        .or(`email.ilike.%${query}%,name.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(50);
    }
    const { data } = await q;
    const list = (data as Profile[]) ?? [];
    setUsers(list);
    if (list.length) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("user_id")
        .in("user_id", list.map((u) => u.id))
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      setPremiumIds(new Set((subs ?? []).map((s) => s.user_id)));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grant = async (user: Profile) => {
    if (!confirm(`Grant a semester unlock to ${user.name || user.email}? (records ₦${PRICE_NAIRA}, provider: manual)`))
      return;
    const expiresAt = new Date(Date.now() + 150 * 86400000).toISOString();
    const { error } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      semester_label: "manual grant",
      amount: 0,
      provider: "manual",
      status: "active",
      expires_at: expiresAt,
    });
    setMessage(error ? `Grant failed: ${error.message}` : "Unlock granted.");
    load();
  };

  const adjustCredits = async (user: Profile) => {
    const raw = prompt(`Adjust credits for ${user.name || user.email} (e.g. 5 or -2):`);
    if (!raw) return;
    const delta = parseInt(raw, 10);
    if (isNaN(delta) || delta === 0) return;
    await supabase
      .from("credits_ledger")
      .insert({ user_id: user.id, delta, reason: "admin_adjust" });
    setMessage(`Credits adjusted by ${delta}.`);
  };

  const toggleRep = async (user: Profile) => {
    if (user.is_rep) {
      await supabase.from("users").update({ is_rep: false }).eq("id", user.id);
    } else {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      await supabase.from("users").update({ is_rep: true, rep_code: code }).eq("id", user.id);
    }
    load();
  };

  return (
    <div>
      <h1 className="font-display text-2xl mb-5">Users & payments</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex gap-2 mb-4"
      >
        <input
          className="input flex-1"
          placeholder="Search name, email or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn !w-auto px-6">Search</button>
      </form>

      {message && <p className="text-sm text-ink-deep/80 mb-3">{message}</p>}

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="card p-3 flex flex-wrap items-center gap-3">
            <div className="min-w-48">
              <p className="text-sm font-medium">{u.name || "(no name)"}</p>
              <p className="text-xs text-ink-deep/60">
                {u.email || u.phone} {u.role === "admin" ? "· admin" : ""}
                {u.is_rep ? ` · rep ${u.rep_code}` : ""}
              </p>
            </div>
            <span
              className={`text-xs font-semibold rounded px-2 py-0.5 ${
                premiumIds.has(u.id) ? "bg-highlight text-ink-deep" : "border border-paper-line text-ink-deep/60"
              }`}
            >
              {premiumIds.has(u.id) ? "Unlocked" : "Free"}
            </span>
            <div className="flex gap-3 text-sm ml-auto">
              {!premiumIds.has(u.id) && (
                <button className="font-semibold text-ink" onClick={() => grant(u)}>
                  Grant unlock
                </button>
              )}
              <button className="text-ink-deep/70" onClick={() => adjustCredits(u)}>
                Credits
              </button>
              <button className="text-ink-deep/70" onClick={() => toggleRep(u)}>
                {u.is_rep ? "Unflag rep" : "Make rep"}
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-sm text-ink-deep/50">No users match.</p>}
      </div>
    </div>
  );
}
