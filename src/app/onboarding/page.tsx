"use client";

// Onboarding: 3 steps, one screen each.
// 1) Email (or phone) + password  2) Name  3) Department (locked) + Level.
// On level pick we auto-subscribe the student to that level's course list.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Stamp } from "@/components/Stamp";
import type { Level } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(""); // rep or referral code (optional)
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState("Mechanical Engineering");
  const [departmentId, setDepartmentId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Already signed in? Skip to the incomplete step.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single();
        if (profile?.level_id && profile?.name) {
          router.replace("/");
          return;
        }
        setStep(profile?.name ? 3 : 2);
      }
      const [{ data: levelRows }, { data: dept }] = await Promise.all([
        supabase.from("levels").select("*").order("position"),
        supabase.from("departments").select("id, name").limit(1).single(),
      ]);
      setLevels((levelRows as Level[]) ?? []);
      if (dept) {
        setDepartmentId(dept.id);
        setDepartmentName(dept.name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("already registered")
          ? "This email already has an account — sign in instead."
          : "Couldn't create the account. Check the details and try again."
      );
      return;
    }
    if (phone) await supabase.from("users").update({ phone }).eq("email", email);
    if (code.trim()) {
      await supabase.rpc("claim_signup_code", { code: code.trim() });
    }
    setStep(2);
  };

  const step2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("users").update({ name }).eq("id", user.id);
    setBusy(false);
    setStep(3);
  };

  const step3 = async () => {
    if (!levelId || !departmentId) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    await supabase
      .from("users")
      .update({ level_id: levelId, department_id: departmentId })
      .eq("id", user.id);

    // Auto-subscribe to the admin-defined course list for this level.
    const { data: courses } = await supabase
      .from("courses")
      .select("id")
      .eq("department_id", departmentId)
      .eq("level_id", levelId);
    if (courses?.length) {
      await supabase
        .from("user_courses")
        .upsert(courses.map((c) => ({ user_id: user.id, course_id: c.id })));
    }
    setToast("Your courses are ready.");
    setTimeout(() => router.replace("/"), 900);
  };

  return (
    <main className="page py-12 fade-in">
      <div className="mb-8">
        <Stamp code="MyPQ" />
        <p className="font-mono text-xs text-ink-deep/50 mt-3">Step {step} of 3</p>
      </div>

      {step === 1 && (
        <form onSubmit={step1} className="space-y-4">
          <h1 className="font-display text-3xl">Create your account</h1>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="tel"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Password (8+ characters)"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Rep or referral code (optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && <p className="text-mark-wrong text-sm">{error}</p>}
          <button className="btn" disabled={busy}>
            {busy ? "Creating…" : "Continue"}
          </button>
          <p className="text-sm text-ink-deep/60 text-center">
            Already registered?{" "}
            <Link href="/login" className="text-ink font-semibold">
              Sign in
            </Link>
          </p>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={step2} className="space-y-4">
          <h1 className="font-display text-3xl">What&apos;s your name?</h1>
          <p className="text-ink-deep/60">It appears on your results and PDF exports.</p>
          <input
            className="input"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="btn" disabled={busy}>
            Continue
          </button>
        </form>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h1 className="font-display text-3xl">Your department and level</h1>
          <div>
            <p className="text-sm text-ink-deep/60 mb-1">Department</p>
            <div className="input bg-paper text-ink-deep/70">{departmentName}</div>
          </div>
          <div>
            <p className="text-sm text-ink-deep/60 mb-1">Level</p>
            <div className="grid grid-cols-2 gap-3">
              {levels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevelId(l.id)}
                  className={`min-h-12 rounded-xl border font-mono font-semibold ${
                    levelId === l.id
                      ? "border-ink bg-ink text-paper"
                      : "border-paper-line bg-white text-ink"
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={step3} disabled={!levelId || busy}>
            {busy ? "Setting up…" : "Finish"}
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 inset-x-0 flex justify-center">
          <div className="bg-ink-deep text-paper rounded-xl px-4 py-2 text-sm">{toast}</div>
        </div>
      )}
    </main>
  );
}
