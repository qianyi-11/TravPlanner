"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cx } from "@/lib/utils";

export function EditableTitle({
  value,
  onSave,
  className,
  inputClassName,
  label = "Rename",
}: {
  value: string;
  onSave: (next: string) => boolean | void | Promise<boolean | void>;
  className?: string;
  inputClassName?: string;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (await onSave(next) !== false) setEditing(false);
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
      <button type="button" onClick={() => setEditing(true)} title={label} aria-label={label} className={cx("group/title flex items-center gap-2 text-left", className)}>
        <span>{value}</span>
        <Pencil size={16} className="shrink-0 opacity-0 transition-opacity group-hover/title:opacity-70" />
      </button>
    );
  }

  return (
    <span className={cx("flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        aria-label={`${label} name`}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className={cx("min-w-0 flex-1 rounded-lg border border-white/40 bg-white/15 px-2 py-0.5 outline-none backdrop-blur focus:border-white/80", inputClassName)}
      />
      <button type="button" onClick={() => void commit()} disabled={saving} title="Save" aria-label="Save" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
        <Check size={16} />
      </button>
      <button type="button" onClick={cancel} disabled={saving} title="Cancel" aria-label="Cancel" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/20">
        <X size={16} />
      </button>
    </span>
  );
}
