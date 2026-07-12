"use client";

// Unlock screen. Copy rule: "Pay once, use all semester" — no auto-renewal,
// and the word for it is never used anywhere in this UI.

import { useState } from "react";
import { Check } from "lucide-react";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";

const PRICE = process.env.NEXT_PUBLIC_SEMESTER_PRICE_NAIRA || "1000";
const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

const included = [
  "Full archive — every past session, every course",
  "AI practice sets, grounded in your course material",
  "AI explanations on any question",
  "Offline archive download",
  "PDF export with your name on it",
];

export default function PremiumPage() {
  const { premium, refresh } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repCode, setRepCode] = useState("");

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/paystack/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rep_code: repCode.trim() || null }),
      });
      const json = await res.json();
      if (json.authorization_url) {
        window.location.href = json.authorization_url;
        return;
      }
      setError("Couldn't start the payment. Try again, or pay by transfer below.");
    } catch {
      setError("You're offline — payments need a connection.");
    }
    setBusy(false);
  };

  if (premium) {
    return (
      <main className="page py-8 fade-in text-center">
        <Stamp code="Unlocked" />
        <h1 className="font-display text-3xl mt-4">You have the full archive.</h1>
        <p className="text-ink-deep/60 mt-2">
          Everything is open for the semester. Good luck in there.
        </p>
        <button className="btn-secondary mt-6" onClick={refresh}>
          Refresh status
        </button>
      </main>
    );
  }

  return (
    <main className="page py-8 fade-in">
      <Stamp code="MyPQ" />
      <h1 className="font-display text-3xl mt-4">Unlock the full archive</h1>
      <p className="text-ink-deep/70 mt-2">
        Pay once, use all semester. <span className="font-semibold">₦{PRICE}</span> — no renewals,
        nothing hidden.
      </p>

      <ul className="mt-6 space-y-3">
        {included.map((item) => (
          <li key={item} className="flex gap-3">
            <Check size={18} className="text-mark-right mt-1 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <input
        className="input mt-6"
        placeholder="Class rep code (optional)"
        value={repCode}
        onChange={(e) => setRepCode(e.target.value)}
      />

      {error && <p className="text-mark-wrong text-sm mt-3">{error}</p>}

      <button className="btn mt-4" onClick={checkout} disabled={busy}>
        {busy ? "Opening checkout…" : `Unlock full archive — ₦${PRICE}`}
      </button>

      {WHATSAPP && (
        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hi, I paid for a MyPQ semester unlock by transfer. Here's my receipt:")}`}
          className="block text-center text-sm text-ink font-semibold mt-4"
        >
          Paid by transfer? Send your receipt on WhatsApp
        </a>
      )}
    </main>
  );
}
