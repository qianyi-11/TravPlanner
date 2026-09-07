import { cx } from "@/lib/utils";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] shadow-[var(--shadow-soft)]",
  secondary:
    "bg-[var(--color-ink)] text-white hover:bg-black",
  outline:
    "bg-white text-[var(--color-ink)] border border-[var(--color-border)] hover:border-[var(--color-ink)]",
  ghost: "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-sand)]",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-95",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3.5 text-base gap-2 rounded-2xl",
};

interface BaseProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth,
  className,
  children,
  ...rest
}: BaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth,
  className,
  children,
}: BaseProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
    >
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
