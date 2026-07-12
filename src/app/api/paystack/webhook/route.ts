import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseService } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { computeCommissionKobo } from "@/lib/commission";

// Paystack webhook: verifies signature, activates the semester unlock, and
// accrues rep commission when the payer was attributed to a class rep.
export async function POST(request: Request) {
  const raw = await request.text();

  const signature = request.headers.get("x-paystack-signature") || "";
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "")
    .update(raw)
    .digest("hex");
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = JSON.parse(raw);
  if (event.event !== "charge.success") return NextResponse.json({ ok: true });

  const data = event.data;
  const userId: string | undefined = data?.metadata?.user_id;
  const reference: string = data?.reference;
  const amountKobo: number = data?.amount ?? 0;
  if (!userId || !reference) return NextResponse.json({ ok: true });

  const db = supabaseService();

  // Idempotent on reference.
  const { data: existing } = await db
    .from("subscriptions")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true });

  const expiresAt = new Date(
    Date.now() + config.semesterDurationDays * 24 * 3600 * 1000
  ).toISOString();

  const { data: sub, error } = await db
    .from("subscriptions")
    .insert({
      user_id: userId,
      semester_label: data?.metadata?.semester_label || config.semesterLabel,
      amount: amountKobo,
      provider: "paystack",
      reference,
      status: "active",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !sub) return NextResponse.json({ error: "insert_failed" }, { status: 500 });

  // Rep attribution: a rep code supplied at checkout wins; otherwise the
  // signup-time attribution still credits the rep (edge case in the spec).
  let repUserId: string | null = null;
  const repCode: string | null = data?.metadata?.rep_code || null;
  if (repCode) {
    const { data: rep } = await db
      .from("users")
      .select("id")
      .eq("rep_code", repCode.toUpperCase())
      .eq("is_rep", true)
      .maybeSingle();
    if (rep && rep.id !== userId) {
      repUserId = rep.id;
      await db
        .from("rep_attributions")
        .upsert(
          { rep_user_id: rep.id, attributed_user_id: userId, subscription_id: sub.id },
          { onConflict: "attributed_user_id" }
        );
    }
  }
  if (!repUserId) {
    const { data: attribution } = await db
      .from("rep_attributions")
      .select("id, rep_user_id")
      .eq("attributed_user_id", userId)
      .maybeSingle();
    if (attribution) {
      repUserId = attribution.rep_user_id;
      await db
        .from("rep_attributions")
        .update({ subscription_id: sub.id })
        .eq("id", attribution.id);
    }
  }

  if (repUserId) {
    const commission = computeCommissionKobo(amountKobo, config.repCommissionPercent);
    if (commission > 0) {
      await db.from("rep_commissions").insert({
        rep_user_id: repUserId,
        subscription_id: sub.id,
        amount: commission,
        status: "accrued",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
