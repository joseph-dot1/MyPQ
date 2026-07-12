// Server-side premium + metering checks. Every AI/PDF route calls these with
// the service client after resolving the user from the session cookie.

import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

export async function hasActivePremium(db: SupabaseClient, userId: string): Promise<boolean> {
  const { count } = await db
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  return (count ?? 0) > 0;
}

export async function creditsBalance(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.from("credits_ledger").select("delta").eq("user_id", userId);
  return (data ?? []).reduce((s, r) => s + r.delta, 0);
}

export type MeterResult =
  | { allowed: true; usedCredit: boolean }
  | { allowed: false; reason: "no_premium" | "quota_exhausted" };

// Premium includes N generations/month; referral credits buy extras.
// Credits can NEVER buy the semester unlock — they only extend AI quota here
// (and the 3-day trial path). That rule is structural: nothing in this module
// or the payment paths converts credits to a subscription.
export async function meterGeneration(
  db: SupabaseClient,
  userId: string
): Promise<MeterResult> {
  const premium = await hasActivePremium(db, userId);
  if (!premium) return { allowed: false, reason: "no_premium" };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count } = await db
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "generate")
    .gte("created_at", monthStart.toISOString());

  if ((count ?? 0) < config.aiMonthlyIncluded) return { allowed: true, usedCredit: false };

  const balance = await creditsBalance(db, userId);
  if (balance > 0) {
    await db.from("credits_ledger").insert({ user_id: userId, delta: -1, reason: "spend_ai" });
    return { allowed: true, usedCredit: true };
  }
  return { allowed: false, reason: "quota_exhausted" };
}
