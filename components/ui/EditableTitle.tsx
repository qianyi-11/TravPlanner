"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cx } from "@/lib/utils";

/**
 * Click-to-edit heading, used for trip and group names on their coloured
 * banners. Enter or the tick saves, Escape or the cross reverts — a blur alone
 * never silently commits, so clicking away can't rename something by accident.
 */
export function EditableTitle({
  value,
  onSave,
  className,
  inputClassName,
  label = "Rename",
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  className?: string;
  inputClassName?: string;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Keep the draft in step when the underlying name changes elsewhere.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title={label}
        className={cx("group/title flex items-center gap-2 text-left", className)}
      >
        <span>{value}</span>
        <Pencil
          size={16}
          className="shrink-0 opacity-0 transition-opacity group-hover/title:opacity-70"
        />
      </button>
    );
  }

  return (
    <span className={cx("flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={cx(
          "min-w-0 flex-1 rounded-lg border border-white/40 bg-white/15 px-2 py-0.5 outline-none backdrop-blur placeholder:text-white/50 focus:border-white/80",
          inputClassName
        )}
      />
      <button
        onClick={commit}
        disabled={saving}
        title="Save"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
      >
        <Check size={16} />
      </button>
      <button
        onClick={cancel}
        disabled={saving}
        title="Cancel"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/20"
      >
        <X size={16} />
      </button>
    </span>
  );
}
