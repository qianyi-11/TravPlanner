import { cx } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-soft)]",
        className
      )}
      {...rest}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "teal" | "success" | "warning" | "danger" | "violet";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[var(--color-sand)] text-[var(--color-ink-soft)]",
    primary: "bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]",
    teal: "bg-[var(--color-teal-soft)] text-[var(--color-teal-dark)]",
    success: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
    warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
    danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
    violet: "bg-[var(--color-violet-soft)] text-[var(--color-violet)]",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  label,
  selected,
  onClick,
  icon,
  className,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer",
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]"
          : "border-[var(--color-border)] bg-white text-[var(--color-ink-soft)] hover:border-[var(--color-ink)]",
        className
      )}
    >
      {icon}
      {label}
    </button>
  );
}
