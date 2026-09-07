import { cx } from "@/lib/utils";
import type { Member } from "@/lib/types";

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

export function MemberAvatar({
  member,
  size = "sm",
  ring = false,
  className,
}: {
  member: Pick<Member, "name" | "initials" | "avatarColor">;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
}) {
  return (
    <div
      title={member.name}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white",
        SIZES[size],
        ring && "ring-2 ring-white",
        className
      )}
      style={{ backgroundColor: member.avatarColor }}
    >
      {member.initials}
    </div>
  );
}

export function MemberStack({
  members,
  max = 5,
  size = "sm",
}: {
  members: Array<Pick<Member, "id" | "name" | "initials" | "avatarColor">>;
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((m) => (
        <MemberAvatar key={m.id} member={m} size={size} ring />
      ))}
      {rest > 0 && (
        <div
          className={cx(
            "flex shrink-0 items-center justify-center rounded-full bg-[var(--color-sand)] font-semibold text-[var(--color-ink-soft)] ring-2 ring-white",
            SIZES[size]
          )}
        >
          +{rest}
        </div>
      )}
    </div>
  );
}
