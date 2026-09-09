"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { usePlannerStore } from "@/lib/store";

const EMOJIS = ["✈️", "🌴", "🏔️", "🗼", "🏝️", "🚐", "🎒", "🌇", "🏙️", "⛩️", "🚗", "🛶"];
const COVERS = [
  "linear-gradient(135deg,#2D3B55,#0E7C74)",
  "linear-gradient(135deg,#4C7BD9,#8A5CF6)",
  "linear-gradient(135deg,#D8A62B,#D8674A)",
  "linear-gradient(135deg,#3E7C7B,#5C8A3A)",
  "linear-gradient(135deg,#C2578B,#7C5CE0)",
];

export default function CreateGroupPage() {
  const router = useRouter();
  const createGroup = usePlannerStore((s) => s.createGroup);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [cover, setCover] = useState(COVERS[0]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const id = await createGroup({
        name: name.trim(),
        emoji,
        description: description.trim() || undefined,
        coverColor: cover,
      });
      router.push(`/groups/${id}`);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/groups" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
        <ArrowLeft size={15} /> Back to groups
      </Link>

      <h1 className="font-display text-2xl font-bold sm:text-3xl">Create your group</h1>
      <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
        A group is your shared room for planning trips with the same crew.
      </p>

      <Card className="mt-8 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div
            className="flex h-24 items-center justify-center rounded-2xl text-4xl"
            style={{ background: cover }}
          >
            {emoji}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Group image</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition-colors ${
                    emoji === e ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {COVERS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCover(c)}
                  className={`h-7 w-11 rounded-lg border-2 transition-transform ${
                    cover === c ? "scale-110 border-[var(--color-ink)]" : "border-transparent"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="name">
              Group name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Japan Adventure"
              className="w-full rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="desc">
              Description <span className="font-normal text-[var(--color-ink-soft)]">(optional)</span>
            </label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group about?"
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <Button type="submit" fullWidth size="lg" disabled={!name.trim() || submitting}>
            {submitting ? "Creating..." : "Create Group"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
