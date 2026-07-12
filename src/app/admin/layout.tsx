"use client";

// Admin shell: role-guarded client-side for UX; every admin write is also
// enforced by RLS (is_admin()) so the guard is cosmetic, not the boundary.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Stamp } from "@/components/Stamp";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/lecturers", label: "Lecturers" },
  { href: "/admin/users", label: "Users & payments" },
  { href: "/admin/reps", label: "Rep payouts" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
      if (data?.role !== "admin") {
        router.replace("/");
        return;
      }
      setAllowed(true);
    })();
  }, [router]);

  if (!allowed) return <div className="p-8 text-ink-deep/50">Checking access…</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-paper-line bg-paper sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-5 py-3 flex items-center gap-6 overflow-x-auto">
          <Link href="/admin">
            <Stamp code="MyPQ Admin" />
          </Link>
          <nav className="flex gap-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm whitespace-nowrap ${
                  pathname === item.href ? "text-ink font-semibold" : "text-ink-deep/60"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="text-sm text-ink-deep/60 ml-auto whitespace-nowrap">
            Student app →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </div>
  );
}
