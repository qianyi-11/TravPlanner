"use client";

import { LinkButton } from "@/components/ui/Button";

export default function JoinPage() {
  return <div className="mx-auto max-w-lg rounded-3xl border border-[var(--color-border)] bg-white p-10 text-center"><h1 className="font-display text-2xl font-bold">Join a trip</h1><p className="mt-2 text-sm text-[var(--color-ink-soft)]">Invite links will open this page with a trip token.</p><LinkButton className="mt-6" href="/my-trips">Back to My Trips</LinkButton></div>;
}
