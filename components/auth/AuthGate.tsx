"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { usePlannerStore } from "@/lib/store";

export function AuthGate() {
  const startDemoSession = usePlannerStore((state) => state.startDemoSession);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [startingDemo, setStartingDemo] = useState(false);

  useEffect(() => {
    fetch("/api/demo-session", { cache: "no-store" })
      .then(async (response) => (response.ok ? (await response.json()) as { enabled?: boolean } : null))
      .then((result) => setDemoEnabled(result?.enabled === true))
      .catch(() => undefined);
  }, []);

  async function handleDemoStart() {
    setStartingDemo(true);
    try {
      await startDemoSession();
    } finally {
      setStartingDemo(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-paper)] px-4">
      <Card className="w-full max-w-md p-7 text-center">
        <h1 className="font-display text-3xl font-bold">Plan together with Trippy</h1>
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">Sign in with Google to access your groups and trips.</p>
        <Button fullWidth className="mt-6" onClick={() => signIn("google")}>Continue with Google</Button>
        {demoEnabled && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-6">
            <Button fullWidth variant="outline" disabled={startingDemo} onClick={handleDemoStart}>
              {startingDemo ? "Opening competition demo…" : "Try Competition Demo"}
            </Button>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">No personal account required for the competition demo.</p>
          </div>
        )}
      </Card>
    </main>
  );
}
