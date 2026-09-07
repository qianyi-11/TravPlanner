import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PricePressure } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { pressureTone } from "@/lib/utils";

const LEVELS: PricePressure["level"][] = ["LOW", "MEDIUM", "HIGH", "VERY HIGH"];

export function PressureRadar({ pressure }: { pressure: PricePressure }) {
  const tone = pressureTone(pressure.level);
  const activeIndex = LEVELS.indexOf(pressure.level);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold">Booking Pressure</h3>
        <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: tone.bg, color: tone.fg }}>
          {pressure.level}
        </span>
      </div>

      <div className="mt-4 flex gap-1.5">
        {LEVELS.map((lvl, i) => (
          <div
            key={lvl}
            className="h-2 flex-1 rounded-full"
            style={{
              backgroundColor: i <= activeIndex ? pressureTone(lvl).fg : "var(--color-sand)",
              opacity: i <= activeIndex ? 1 : 0.6,
            }}
          />
        ))}
      </div>

      <p className="mt-3 text-xs font-medium text-[var(--color-ink-soft)]">
        We estimate booking and price pressure using known demand signals — not a guaranteed forecast.
      </p>

      <div className="mt-4 space-y-2">
        {pressure.reasons.map((r) => (
          <div key={r} className="flex items-start gap-2 text-sm text-[var(--color-ink-soft)]">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: tone.fg }} />
            {r}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--color-sand)] px-3.5 py-2.5">
        <CheckCircle2 size={15} className="text-[var(--color-ink)]" />
        <span className="text-sm font-bold">{pressure.recommendation}</span>
      </div>
    </Card>
  );
}
