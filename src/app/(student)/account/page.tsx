"use client";

// Account: profile, level change, referral code + share card, credits,
// rep dashboard (read-only), logout.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useProfile } from "@/lib/useProfile";
import { Stamp } from "@/components/Stamp";
import type { Level } from "@/lib/types";

export default function AccountPage() {
  const router = useRouter();
  const { userId, profile, premium, refresh } = useProfile();
  const [levels, setLevels] = useState<Level[]>([]);
  const [credits, setCredits] = useState(0);
  const [repStats, setRepStats] = useState<{ signups: number; accrued: number; paid: number } | null>(null);
  const [changingLevel, setChangingLevel] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !profile) return;
    (async () => {
      const supabase = supabaseBrowser();
      const [{ data: levelRows }, { data: ledger }] = await Promise.all([
        supabase.from("levels").select("*").order("position"),
        supabase.from("credits_ledger").select("delta").eq("user_id", userId),
      ]);
      setLevels((levelRows as Level[]) ?? []);
      setCredits((ledger ?? []).reduce((s, r) => s + r.delta, 0));

      if (profile.is_rep) {
        const [{ count: signups }, { data: commissions }] = await Promise.all([
          supabase
            .from("rep_attributions")
            .select("id", { count: "exact", head: true })
            .eq("rep_user_id", userId),
          supabase.from("rep_commissions").select("amount, status").eq("rep_user_id", userId),
        ]);
        const accrued = (commissions ?? [])
          .filter((c) => c.status === "accrued")
          .reduce((s, c) => s + c.amount, 0);
        const paid = (commissions ?? [])
          .filter((c) => c.status === "paid")
          .reduce((s, c) => s + c.amount, 0);
        setRepStats({ signups: signups ?? 0, accrued, paid });
      }
    })();
  }, [userId, profile]);

  const changeLevel = async (levelId: string) => {
    if (!userId || !profile?.department_id) return;
    const supabase = supabaseBrowser();
    await supabase.from("users").update({ level_id: levelId }).eq("id", userId);
    const { data: courses } = await supabase
      .from("courses")
      .select("id")
      .eq("department_id", profile.department_id)
      .eq("level_id", levelId);
    if (courses?.length) {
      await supabase
        .from("user_courses")
        .upsert(courses.map((c) => ({ user_id: userId, course_id: c.id })));
    }
    setChangingLevel(false);
    setMessage("Level updated — your new courses are ready.");
    refresh();
  };

  const share = async () => {
    const text = `I practise real past questions on MyPQ. Sign up with my code ${profile?.referral_code} and we both benefit.`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* dismissed */
      }
    } else {
      await navigator.clipboard.writeText(text);
      setMessage("Copied — paste it in your class group.");
    }
  };

  const startTrial = async () => {
    const res = await fetch("/api/credits/trial", { method: "POST" });
    const json = await res.json();
    if (res.ok) {
      setMessage("3-day trial active. Everything is open — go practise.");
      refresh();
    } else if (json.error === "not_enough_credits") {
      setMessage(`A 3-day trial costs ${json.needed} credits. Share your code to earn more.`);
    } else if (json.error === "already_premium") {
      setMessage("You already have the full archive.");
    } else {
      setMessage("Couldn't start the trial right now.");
    }
  };

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  };

  if (!profile) return <main className="page py-6" />;

  const levelName = levels.find((l) => l.id === profile.level_id)?.name ?? "—";

  return (
    <main className="page py-6 fade-in">
      <h1 className="font-display text-2xl mb-5">Account</h1>

      <section className="card p-4">
        <p className="font-medium">{profile.name}</p>
        <p className="text-sm text-ink-deep/60">{profile.email || profile.phone}</p>
        <div className="rule mt-3 pt-3 flex items-center justify-between">
          <p className="text-sm">
            Level: <span className="font-mono font-semibold">{levelName}</span>
          </p>
          <button className="text-sm font-semibold text-ink" onClick={() => setChangingLevel(!changingLevel)}>
            I&apos;ve moved level
          </button>
        </div>
        {changingLevel && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {levels.map((l) => (
              <button
                key={l.id}
                onClick={() => changeLevel(l.id)}
                className={`min-h-10 rounded-lg border font-mono text-sm font-semibold ${
                  l.id === profile.level_id ? "border-ink bg-ink text-paper" : "border-paper-line"
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card p-4 mt-4">
        <p className="font-medium">{premium ? "Full archive: unlocked" : "Full archive: locked"}</p>
        {!premium && (
          <Link href="/premium" className="btn mt-3">
            Unlock full archive
          </Link>
        )}
      </section>

      {/* Share card — the Stamp motif carries the referral code. */}
      <section className="card p-4 mt-4">
        <p className="font-medium mb-2">Bring your classmates</p>
        <div className="border-2 border-ink rounded-xl p-4 text-center bg-white">
          <Stamp code="MyPQ" />
          <p className="text-sm text-ink-deep/70 mt-2">My referral code</p>
          <p className="font-mono text-2xl font-semibold text-ink tracking-widest">
            {profile.referral_code}
          </p>
        </div>
        <button className="btn-secondary mt-3" onClick={share}>
          Share my code
        </button>
        <div className="rule mt-3 pt-3 flex items-center justify-between text-sm">
          <span>
            Credits: <span className="font-mono font-semibold">{credits}</span>
          </span>
          {!premium && (
            <button className="font-semibold text-ink" onClick={startTrial}>
              Use 3 credits → 3-day trial
            </button>
          )}
        </div>
        <p className="text-xs text-ink-deep/50 mt-2">
          Credits buy extra AI practice or a 3-day trial. The semester unlock is always paid directly.
        </p>
      </section>

      {profile.is_rep && repStats && (
        <section className="card p-4 mt-4">
          <p className="font-medium">Class rep dashboard</p>
          <p className="text-sm text-ink-deep/70 mt-1">
            Your rep code:{" "}
            <span className="font-mono font-semibold text-ink">{profile.rep_code}</span>
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-lg border border-paper-line p-2">
              <p className="font-mono font-semibold">{repStats.signups}</p>
              <p className="text-xs text-ink-deep/60">signups</p>
            </div>
            <div className="rounded-lg border border-paper-line p-2">
              <p className="font-mono font-semibold">₦{(repStats.accrued / 100).toLocaleString()}</p>
              <p className="text-xs text-ink-deep/60">accrued</p>
            </div>
            <div className="rounded-lg border border-paper-line p-2">
              <p className="font-mono font-semibold">₦{(repStats.paid / 100).toLocaleString()}</p>
              <p className="text-xs text-ink-deep/60">paid out</p>
            </div>
          </div>
          <p className="text-xs text-ink-deep/50 mt-2">
            Commission is paid by transfer at the end of each drive.
          </p>
        </section>
      )}

      {message && <p className="text-sm text-ink-deep/80 mt-4">{message}</p>}

      {profile.role === "admin" && (
        <Link href="/admin" className="btn-secondary mt-6">
          Open admin
        </Link>
      )}

      <button className="mt-6 text-sm text-mark-wrong font-semibold w-full" onClick={logout}>
        Log out
      </button>
    </main>
  );
}
