import { format, startOfWeek, addDays, isSunday } from "date-fns";

export function todayISO() {
  const d = new Date();
  return format(d, "yyyy-MM-dd");
}
export function fmt(d: Date | string) {
  const dd = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return format(dd, "yyyy-MM-dd");
}
export function currentWeekDays(
  anchor = new Date(),
): { date: string; label: string; sunday: boolean }[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 }); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return { date: fmt(d), label: format(d, "EEE d"), sunday: isSunday(d) };
  });
}
export function isSundayISO(iso: string) {
  return isSunday(new Date(iso + "T00:00:00"));
}
export function prettyDate(iso: string) {
  return format(new Date(iso + "T00:00:00"), "EEEE, MMM d");
}
