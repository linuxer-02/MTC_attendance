import { eachDayOfInterval, format, isSunday, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

/**
 * Attendance domain rules — the single source of truth for how a percentage is
 * computed, what counts as a working day, and how Anna University Regulations
 * 2025 map a percentage onto exam eligibility.
 */

/** Minimum attendance to sit the university exam without condonation. */
export const MIN_ATTENDANCE_PCT = 75;
/** Floor for condonation of shortage; below this the semester must be repeated. */
export const CONDONATION_MIN_PCT = 65;

/** Whole-number attendance percentage; 0 when there are no working days yet. */
export function attendancePct(present: number, total: number): number {
  return total > 0 ? Math.round((present / total) * 100) : 0;
}

/**
 * Working days in an inclusive ISO date range: every day that is not a Sunday
 * and not a marked class holiday. Returns ISO date strings.
 */
export function workingDaysBetween(
  fromISO: string,
  toISO: string,
  holidays?: ReadonlySet<string>,
): string[] {
  if (fromISO > toISO) return [];
  return eachDayOfInterval({ start: parseISO(fromISO), end: parseISO(toISO) })
    .filter((d) => !isSunday(d))
    .map((d) => format(d, "yyyy-MM-dd"))
    .filter((d) => !holidays?.has(d));
}

// ── Anna University Regulations 2025 — exam eligibility ───────────
//   >= 75%       eligible to appear for the university examination
//   65% – 74.99% condonation of shortage may be granted by the Head of
//                Institution (subject to the University's prior approval)
//   < 65%        not eligible; the semester must be repeated
export type Eligibility = "eligible" | "condonation" | "ineligible";

export function eligibilityOf(pct: number): Eligibility {
  if (pct >= MIN_ATTENDANCE_PCT) return "eligible";
  if (pct >= CONDONATION_MIN_PCT) return "condonation";
  return "ineligible";
}

export const ELIGIBILITY_META: Record<
  Eligibility,
  { label: string; toneClass: string; badgeClass: string; icon: typeof CheckCircle2 }
> = {
  eligible: {
    label: "Eligible",
    toneClass: "text-success",
    badgeClass: "text-success bg-success/10 border-success/20",
    icon: CheckCircle2,
  },
  condonation: {
    label: "Condonation Required",
    toneClass: "text-accent",
    badgeClass: "text-accent bg-accent/10 border-accent/20",
    icon: AlertTriangle,
  },
  ineligible: {
    label: "Not Eligible",
    toneClass: "text-destructive",
    badgeClass: "text-destructive bg-destructive/10 border-destructive/20",
    icon: XCircle,
  },
};

/**
 * Indian academic years run June–May, so June 1 of the current session is a
 * sane default. There is no stored semester-start column yet, so screens let
 * the user override this.
 */
export function defaultAcademicYearStart(now = new Date()): string {
  const sessionYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return format(new Date(sessionYear, 5, 1), "yyyy-MM-dd");
}

/** Text colour for a bare percentage (pass/fail against the 75% rule). */
export function pctToneClass(pct: number): string {
  return pct >= MIN_ATTENDANCE_PCT ? "text-success" : "text-destructive";
}

/** Fill colour for a percentage bar or chart cell. */
export function pctBarColor(pct: number): string {
  return pct >= MIN_ATTENDANCE_PCT ? "var(--color-success)" : "var(--color-destructive)";
}
