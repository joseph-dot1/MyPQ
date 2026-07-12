"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Stamp } from "@/components/Stamp";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("That email and password don't match. Try again.");
      return;
    }
    router.replace("/");
  };

  return (
    <main className="page py-12 fade-in">
      <div className="mb-8">
        <Stamp code="MyPQ" />
        <h1 className="font-display text-3xl mt-4">Welcome back</h1>
        <p className="text-ink-deep/60 mt-1">Sign in to continue practising.</p>
      </div>
      <form onSubmit={signIn} className="space-y-4">
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
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-mark-wrong text-sm">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-ink-deep/60 mt-6 text-center">
        New here?{" "}
        <Link href="/onboarding" className="text-ink font-semibold">
          Create an account
        </Link>
      </p>
    </main>
  );
}
