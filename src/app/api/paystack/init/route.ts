import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { config } from "@/lib/config";

// Starts a Paystack checkout for the semester unlock. Pay once, use all
// semester — there is no auto-renewal anywhere in this system.
export async function POST(request: Request) {
  const auth = await supabaseServer();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const origin = new URL(request.url).origin;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email || `${user.id}@mypq.app`,
      amount: config.semesterPriceKobo,
      currency: "NGN",
      callback_url: `${origin}/premium?status=pending`,
      metadata: {
        user_id: user.id,
        semester_label: config.semesterLabel,
        rep_code: body.rep_code || null,
      },
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.status) {
    return NextResponse.json({ error: "paystack_init_failed" }, { status: 502 });
  }
  return NextResponse.json({ authorization_url: json.data.authorization_url });
}
