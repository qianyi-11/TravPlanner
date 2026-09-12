"use client";

import { use, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function JoinGroupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "joining" | "error">("idle");
  const [message, setMessage] = useState("Sign in to join this group.");

  async function join() {
    setState("joining");
    const response = await fetch(`/api/invites/${token}/join`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { groupId?: string; error?: string };
    if (response.status === 401) {
      await signIn("google", { callbackUrl: `/join/${token}` });
      return;
    }
    if (!response.ok || !data.groupId) {
      setState("error");
      setMessage(data.error ?? "This invite could not be used.");
      return;
    }
    router.push(`/groups/${data.groupId}`);
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="font-display text-2xl font-bold">Join a Trippy group</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{message}</p>
        <Button className="mt-5" fullWidth onClick={join} disabled={state === "joining"}>
          {state === "joining" ? "Joining…" : "Sign in and join"}
        </Button>
      </Card>
    </div>
  );
}
