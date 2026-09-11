"use client";

import { signIn } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function AuthGate() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-paper)] px-4">
      <Card className="w-full max-w-md p-7 text-center">
        <h1 className="font-display text-3xl font-bold">Plan together with TravPlanner</h1>
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">Sign in with Google to access your groups and trips.</p>
        <Button fullWidth className="mt-6" onClick={() => signIn("google")}>Continue with Google</Button>
      </Card>
    </main>
  );
}
