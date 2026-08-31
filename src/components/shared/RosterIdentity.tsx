import { cn } from "@/lib/utils";

/**
 * Roll number + name, with the fixed-width monospace roll column used in every
 * student list (Mark, Report, Analytics, Admin roster). Keeping the widths here
 * means the columns line up across screens.
 */
export function RosterIdentity({
  rollNo,
  name,
  emphasis,
  className,
}: {
  rollNo: string;
  name: string;
  /** Bolds the name — used in at-risk / roster lists. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 min-w-0", className)}>
      <span className="font-mono text-xs text-muted-foreground min-w-18 max-w-30 truncate shrink-0">
        {rollNo}
      </span>
      <span className={cn("truncate", emphasis && "font-medium")}>{name}</span>
    </div>
  );
}
