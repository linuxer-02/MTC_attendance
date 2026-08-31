import type { ElementType } from "react";
import { cn } from "@/lib/utils";

export type StatTile = {
  label: string;
  value: string | number;
  /** Text colour class for the value, e.g. "text-success". */
  tone?: string;
  icon?: ElementType;
  /** Extra classes for the tile itself, e.g. an eligibility badge tint. */
  tileClass?: string;
};

/**
 * The rounded stat-tile row used by Home (week totals), Analytics (month
 * summary + eligibility counts) and the Report page (total/present/absent).
 */
export function StatTiles({ tiles, className }: { tiles: StatTile[]; className?: string }) {
  return (
    <div
      className={cn("grid gap-2 stagger-children", className)}
      style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          className={cn(
            "rounded-2xl border bg-card p-3 text-center shadow-sm card-hover animate-slide-up",
            t.tileClass,
          )}
        >
          {t.icon && <t.icon className={cn("h-5 w-5 mx-auto mb-1", t.tone)} />}
          <div className={cn("text-2xl display font-bold", t.tone)}>{t.value}</div>
          <div className="text-[10px] uppercase text-muted-foreground mt-0.5 tracking-wide leading-tight">
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}
