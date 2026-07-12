"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, BarChart3, User } from "lucide-react";

const items = [
  { href: "/", label: "Home", icon: BookOpen },
  { href: "/practice", label: "Practice", icon: ClipboardList },
  { href: "/results", label: "Results", icon: BarChart3 },
  { href: "/account", label: "Account", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 h-14 bg-paper border-t border-paper-line z-40">
      <div className="mx-auto max-w-content h-full grid grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs ${
                active ? "text-ink font-semibold" : "text-ink-deep/50"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
