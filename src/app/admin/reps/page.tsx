"use client";

// Rep payout report: accrued commission per rep, mark paid after manual
// transfer. NO automated payouts in MVP.

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type CommissionRow = {
  id: string;
  rep_user_id: string;
  amount: number;
  status: "accrued" | "paid";
  created_at: string;
  users: { name: string | null; email: string | null; phone: string | null; rep_code: string | null } | null;
};

export default function RepPayoutsPage() {
  const supabase = supabaseBrowser();
  const [rows, setRows] = useState<CommissionRow[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("rep_commissions")
      .select("*, users!rep_commissions_rep_user_id_fkey(name, email, phone, rep_code)")
      .order("created_at", { ascending: false });
    setRows((data as CommissionRow[]) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byRep = new Map<string, { name: string; code: string; accrued: number; rows: CommissionRow[] }>();
  for (const r of rows) {
    if (!byRep.has(r.rep_user_id)) {
      byRep.set(r.rep_user_id, {
        name: r.users?.name || r.users?.email || r.rep_user_id.slice(0, 8),
        code: r.users?.rep_code ?? "—",
        accrued: 0,
        rows: [],
      });
    }
    const entry = byRep.get(r.rep_user_id)!;
    entry.rows.push(r);
    if (r.status === "accrued") entry.accrued += r.amount;
  }

  const markPaid = async (repUserId: string) => {
    if (!confirm("Mark all accrued commission for this rep as paid? Do this after the transfer.")) return;
    await supabase
      .from("rep_commissions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("rep_user_id", repUserId)
      .eq("status", "accrued");
    load();
  };

  return (
    <div>
      <h1 className="font-display text-2xl mb-5">Rep payouts</h1>
      {byRep.size === 0 && (
        <p className="text-sm text-ink-deep/50">No commission accrued yet.</p>
      )}
      <div className="space-y-4">
        {Array.from(byRep.entries()).map(([repId, rep]) => (
          <div key={repId} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {rep.name} <span className="font-mono text-sm text-ink">({rep.code})</span>
                </p>
                <p className="text-sm text-ink-deep/60">
                  Owed: <span className="font-mono font-semibold">₦{(rep.accrued / 100).toLocaleString()}</span>
                </p>
              </div>
              {rep.accrued > 0 && (
                <button className="btn !w-auto px-5" onClick={() => markPaid(repId)}>
                  Mark paid
                </button>
              )}
            </div>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-ink-deep/60">
                {rep.rows.length} commission entries
              </summary>
              <ul className="mt-2 space-y-1">
                {rep.rows.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>
                      ₦{(r.amount / 100).toLocaleString()} ·{" "}
                      {new Date(r.created_at).toLocaleDateString("en-NG")}
                    </span>
                    <span className={r.status === "paid" ? "text-mark-right" : "text-ink-deep/60"}>
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
