"use client";

import { Compass, Home, Receipt, Users, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { usePlannerStore } from "@/lib/store";
import { MemberAvatar } from "@/components/ui/Avatar";
import { LoadingState } from "@/components/ui/States";
import { cx } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", shortLabel: "Home", icon: Home, match: (p: string) => p === "/" },
  {
    href: "/my-trips",
    label: "My Trips",
    shortLabel: "Trips",
    icon: Compass,
    match: (p: string) => p.startsWith("/my-trips") || p.startsWith("/trips"),
  },
  { href: "/groups", label: "Groups", shortLabel: "Groups", icon: Users, match: (p: string) => p.startsWith("/groups") },
  {
    href: "/split-bill",
    label: "Bill",
    shortLabel: "Bill",
    icon: Receipt,
    match: (p: string) => p === "/split-bill",
  },
  { href: "/profile", label: "Profile", shortLabel: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/profile") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = usePlannerStore((s) => s.members[s.currentUserId]);
  const initialized = usePlannerStore((s) => s.initialized);
  const hydrate = usePlannerStore((s) => s.hydrate);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    hydrate();
  }, [hydrate]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-paper)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
              <Compass size={17} strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Trippy</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--color-ink)] text-white"
                      : "text-[var(--color-ink-soft)] hover:bg-[var(--color-sand)]"
                  )}
                >
                  <item.icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link href="/profile" className="hidden sm:block">
            {me && <MemberAvatar member={me} size="sm" />}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pb-12">
        {initialized ? children : <LoadingState label="Loading your trips..." />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center border-t border-[var(--color-border)] bg-white/95 py-2 backdrop-blur sm:hidden">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium",
                active ? "text-[var(--color-primary)]" : "text-[var(--color-ink-soft)]"
              )}
            >
              <item.icon size={19} strokeWidth={active ? 2.4 : 2} />
              {item.shortLabel}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
