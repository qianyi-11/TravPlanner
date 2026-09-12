"use client";

import { use, useState } from "react";
import { notFound } from "next/navigation";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "@/lib/store";
import type { FoodPreference, Interest, Pace } from "@/lib/types";
import { Card, Chip } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MemberAvatar } from "@/components/ui/Avatar";
import { TripHeader } from "@/components/trip/TripHeader";

const INTERESTS: Interest[] = [
  "Food", "Shopping", "Nature", "Culture", "History", "Adventure",
  "Photography", "Nightlife", "Relaxation", "Museums", "Architecture",
];
const FOOD: FoodPreference[] = ["Local Food", "Fine Dining", "Street Food", "Halal", "Vegetarian", "Cafe", "Dessert"];
const PACES: Pace[] = ["Relaxed", "Balanced", "Fast-paced"];

export default function PreferencesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const trip = usePlannerStore((s) => s.trips[tripId]);
  const currentUserId = usePlannerStore((s) => s.currentUserId);
  const me = usePlannerStore((s) => s.members[s.currentUserId]);
  const members = usePlannerStore(
    useShallow((s) => (trip ? trip.memberIds.map((id) => s.members[id]).filter(Boolean) : []))
  );
  const updatePrefs = usePlannerStore((s) => s.updateMemberPreferences);
  const setStage = usePlannerStore((s) => s.setStage);
  const showToast = usePlannerStore((s) => s.showToast);

  const [interests, setInterests] = useState<Interest[]>(me?.preferences?.interests ?? []);
  const [food, setFood] = useState<FoodPreference[]>(me?.preferences?.foodPreferences ?? []);
  const [pace, setPace] = useState<Pace>(me?.preferences?.pace ?? "Balanced");
  const [dislikes, setDislikes] = useState<string[]>(me?.preferences?.dislikes ?? []);
  const [dislikeInput, setDislikeInput] = useState("");
  const [budget, setBudget] = useState(me?.preferences?.personalBudget ?? 1500);

  if (!trip) notFound();

  function toggle<T>(list: T[], setList: (v: T[]) => void, value: T) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function addTag(list: string[], setList: (v: string[]) => void, value: string, clear: () => void) {
    const v = value.trim();
    if (v && !list.includes(v)) setList([...list, v]);
    clear();
  }

  async function handleSave() {
    // Saving preferences moves the trip on to collecting ideas.
    if (trip?.stage === "preferences") void setStage(tripId, "ideas");
    updatePrefs(currentUserId, {
      interests,
      foodPreferences: food,
      pace,
      mustDo: [],
      dislikes,
      personalBudget: budget,
    });
    showToast("Preferences saved");
    router.push(`/trips/${tripId}/places`);
  }

  return (
    <div>
      <TripHeader trip={trip} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-2xl font-bold">Your preferences</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Help the group understand what you&apos;re looking for on this trip.
            </p>
          </div>

          <Card className="p-5">
            <h3 className="mb-3 font-display text-base font-bold">Interests</h3>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <Chip key={i} label={i} selected={interests.includes(i)} onClick={() => toggle(interests, setInterests, i)} />
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display text-base font-bold">Food preferences</h3>
            <div className="flex flex-wrap gap-2">
              {FOOD.map((f) => (
                <Chip key={f} label={f} selected={food.includes(f)} onClick={() => toggle(food, setFood, f)} />
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display text-base font-bold">Pace</h3>
            <div className="grid grid-cols-3 gap-2">
              {PACES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPace(p)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                    pace === p
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
                      : "border-[var(--color-border)] text-[var(--color-ink-soft)] hover:border-[var(--color-ink)]"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-1 font-display text-base font-bold">Dislikes</h3>
            <p className="mb-3 text-xs text-[var(--color-ink-soft)]">Things you&apos;d rather avoid.</p>
            <TagInput
              value={dislikeInput}
              onChange={setDislikeInput}
              onAdd={() => addTag(dislikes, setDislikes, dislikeInput, () => setDislikeInput(""))}
              placeholder="e.g. Long queues"
            />
            <TagList tags={dislikes} onRemove={(t) => setDislikes(dislikes.filter((x) => x !== t))} tone="danger" />
          </Card>

          <Card className="p-5">
            <label className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className="font-display text-base font-bold">Personal budget</span>
              <span className="text-[var(--color-primary)]">RM {budget.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={100}
              max={8000}
              step={50}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </Card>

          <Button size="lg" fullWidth onClick={handleSave}>
            Save Preferences
          </Button>
        </div>

        <Card className="h-fit p-5">
          <h3 className="mb-4 font-display text-base font-bold">Group preferences</h3>
          <div className="space-y-4">
            {members.map((m) => (
              <div key={m.id} className="flex items-start gap-3">
                <MemberAvatar member={m} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{m.name}</p>
                  {m.preferences ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--color-ink-soft)]">
                      {m.preferences.interests.slice(0, 3).join(", ") || "No interests set"} · {m.preferences.pace}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Not set yet</p>
                  )}
                </div>
                {m.preferences && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--color-teal)]" />}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TagInput({
  value,
  onChange,
  onAdd,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd();
          }
        }}
        placeholder={placeholder}
        className="flex-1 rounded-xl border border-[var(--color-border)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
      />
      <Button type="button" variant="outline" size="sm" icon={<Plus size={14} />} onClick={onAdd}>
        Add
      </Button>
    </div>
  );
}

function TagList({ tags, onRemove, tone }: { tags: string[]; onRemove: (t: string) => void; tone: "teal" | "danger" }) {
  if (tags.length === 0) return null;
  const cls =
    tone === "teal"
      ? "bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]"
      : "bg-[var(--color-danger-bg)] text-[var(--color-danger)]";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((t) => (
        <span key={t} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${cls}`}>
          {t}
          <button onClick={() => onRemove(t)} className="cursor-pointer">
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
