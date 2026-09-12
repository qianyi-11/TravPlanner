"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { usePlannerStore } from "@/lib/store";

export function ToastHost() {
  const toast = usePlannerStore((s) => s.toast);
  const clearToast = usePlannerStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 2800);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-[100] max-w-[90vw] -translate-x-1/2 sm:bottom-8 animate-toast-in">
      <div className="flex items-center gap-2.5 rounded-full bg-[var(--color-ink)] px-4 py-3 text-sm font-medium text-white shadow-[var(--shadow-pop)]">
        <CheckCircle2 size={16} className="text-[var(--color-teal)]" />
        {toast}
      </div>
    </div>
  );
}
