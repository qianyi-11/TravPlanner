"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      {description && <p className="text-sm text-[var(--color-ink-soft)]">{description}</p>}
      <div className="mt-5 flex gap-2.5">
        <Button variant="outline" fullWidth onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} fullWidth onClick={handleConfirm} disabled={busy}>
          {busy ? "Please wait..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
