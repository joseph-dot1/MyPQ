import { NextResponse } from "next/server";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { creditsBalance, hasActivePremium } from "@/lib/server/premium";
import { config } from "@/lib/config";

const TRIAL_COST_CREDITS = 3;

// Referral credits can buy a 3-day trial — never the semester unlock.
// The trial is a short-lived subscription row with provider='manual' and a
// 3-day expiry; the paid unlock path is exclusively Paystack/admin-grant.
export async function POST() {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = supabaseService();

  if (await hasActivePremium(db, user.id)) {
    return NextResponse.json({ error: "already_premium" }, { status: 409 });
  }
  const balance = await creditsBalance(db, user.id);
  if (balance < TRIAL_COST_CREDITS) {
    return NextResponse.json({ error: "not_enough_credits", needed: TRIAL_COST_CREDITS }, { status: 403 });
  }

  await db.from("credits_ledger").insert({
    user_id: user.id,
    delta: -TRIAL_COST_CREDITS,
    reason: "spend_trial",
  });
  const expiresAt = new Date(Date.now() + config.trialDays * 24 * 3600 * 1000).toISOString();
  await db.from("subscriptions").insert({
    user_id: user.id,
    semester_label: `${config.semesterLabel} (3-day trial)`,
    amount: 0,
    provider: "manual",
    status: "active",
    expires_at: expiresAt,
  });

  return NextResponse.json({ ok: true, expires_at: expiresAt });
}
