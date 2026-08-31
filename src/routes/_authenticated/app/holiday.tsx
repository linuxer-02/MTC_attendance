import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessibleClasses } from "@/features/shared/roles";
import { todayISO, prettyDate, isSundayISO } from "@/features/shared/date";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Palmtree, CalendarCheck2, Trash2, CalendarX2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { useHolidayInvalidator, currentUserId } from "@/features/shared/attendanceQueries";
import { qk } from "@/features/shared/queryKeys";
import { ClassSelect } from "@/components/shared/ClassSelect";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const searchSchema = z.object({ classId: z.string().optional() });
export const Route = createFileRoute("/_authenticated/app/holiday")({
  head: () => ({ meta: [{ title: "Mark Holiday — Smart Attend Hub" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: HolidayPage,
});

function HolidayPage() {
  const sp = Route.useSearch();
  const { data: classes } = useMyAccessibleClasses();
  const [classId, setClassId] = useState<string | null>(sp.classId || null);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [unmarkTarget, setUnmarkTarget] = useState<{ id: string; date: string } | null>(null);
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  // Live check: is the selected date already a holiday?
  const { data: existingHoliday, refetch: refetchExisting } = useQuery({
    enabled: !!classId && !!date,
    queryKey: qk.holidays(classId, date, date),
    queryFn: async () => {
      const { data } = await supabase
        .from("class_holidays")
        .select("id, reason")
        .eq("class_id", classId!)
        .eq("date", date)
        .maybeSingle();
      return data;
    },
  });

  // Load all holidays for the current month (for the list below)
  const monthStart = format(startOfMonth(parseISO(date.substring(0, 7) + "-01")), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(parseISO(date.substring(0, 7) + "-01")), "yyyy-MM-dd");

  const { data: monthHolidays, refetch: refetchMonth } = useQuery({
    enabled: !!classId,
    queryKey: qk.holidays(classId, monthStart, monthEnd),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_holidays")
        .select("id, date, reason")
        .eq("class_id", classId!)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Covers both the legacy prefixes (screens not yet migrated) and the new
  // `qk` roots read by Mark/Analytics. See REFACTOR_PLAN.md step 1.
  const invalidateHolidays = useHolidayInvalidator();

  const invalidateAll = () => {
    invalidateHolidays();
    refetchExisting();
    refetchMonth();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;
    if (isSundayISO(date)) return toast.error("Sunday is already a leave — no need to mark.");

    const trimmedReason = reason.trim();
    if (!trimmedReason) return toast.error("Please provide a reason for the holiday.");
    if (trimmedReason.length > 200) return toast.error("Reason must be 200 characters or less.");

    const uid = await currentUserId();
    if (!uid) return toast.error("Session expired. Please sign in again.");

    setSaving(true);
    const { error } = await supabase
      .from("class_holidays")
      .upsert(
        { class_id: classId, date, reason: trimmedReason, created_by: uid },
        { onConflict: "class_id,date" },
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Holiday saved ✓");
    setReason("");
    invalidateAll();
  };

  const triggerUnmark = (id: string, dateStr: string) => {
    setUnmarkTarget({ id, date: dateStr });
  };

  const confirmUnmark = async () => {
    if (!unmarkTarget) return;
    const { id, date: dateStr } = unmarkTarget;
    setUnmarkTarget(null);
    setRemoving(id);
    const { error } = await supabase.from("class_holidays").delete().eq("id", id);
    setRemoving(null);
    if (error) return toast.error("Failed to remove holiday: " + error.message);
    toast.success(`Holiday on ${prettyDate(dateStr)} removed ✓`);
    invalidateAll();
  };

  return (
    <div className="max-w-md mx-auto space-y-5 animate-slide-up">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-accent flex items-center justify-center">
          <Palmtree className="h-4 w-4 text-accent-foreground" />
        </span>
        Mark Holiday
      </h1>

      <form onSubmit={submit} className="rounded-2xl border bg-card p-5 shadow-sm space-y-5">
        {/* Class */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Class
          </label>
          <ClassSelect
            classes={classes}
            value={classId}
            onChange={setClassId}
            className="mt-1.5 w-full"
          />
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
          />
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarCheck2 className="h-3.5 w-3.5" />
            {prettyDate(date)}
          </div>

          {/* Live status indicator for selected date */}
          {existingHoliday && (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-accent/10 border border-accent/20 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-accent font-medium">
                <Palmtree className="h-3.5 w-3.5" />
                Already a holiday: <span className="font-semibold">"{existingHoliday.reason}"</span>
              </div>
              <button
                type="button"
                onClick={() => triggerUnmark(existingHoliday.id, date)}
                disabled={removing === existingHoliday.id}
                className="flex items-center gap-1 text-xs text-destructive font-medium hover:underline ml-2 shrink-0 btn-press"
              >
                <CalendarX2 className="h-3.5 w-3.5" />
                {removing === existingHoliday.id ? "Removing…" : "Unmark"}
              </button>
            </div>
          )}
        </div>

        {/* Reason — hidden if already marked (since you can edit via unmark + re-add) */}
        {!existingHoliday && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Reason
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={200}
              placeholder="e.g. College holiday, Festival, Exam"
              className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {!existingHoliday && (
          <button
            disabled={saving}
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl gradient-primary text-primary-foreground py-3.5 text-sm font-medium shadow-sm btn-press"
          >
            <Palmtree className="h-4 w-4" />
            {saving ? "Saving…" : "Save Holiday"}
          </button>
        )}
      </form>

      {/* Current Month Holidays List */}
      {monthHolidays && monthHolidays.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
          <h2 className="text-lg display flex items-center gap-2">
            <CalendarX2 className="h-4 w-4 text-accent" />
            Holidays This Month
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              {monthHolidays.length} marked
            </span>
          </h2>
          <ul className="divide-y rounded-xl border bg-background overflow-hidden">
            {monthHolidays.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between px-3 py-2.5 text-sm gap-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {prettyDate(h.date)}
                  </span>
                  <span className="truncate text-sm font-medium">{h.reason}</span>
                </div>
                <button
                  onClick={() => triggerUnmark(h.id, h.date)}
                  disabled={removing === h.id}
                  className="flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors shrink-0 btn-press"
                  title="Remove holiday"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {removing === h.id ? "…" : "Unmark"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border bg-accent/8 border-accent/20 p-4 text-sm">
        <p className="text-muted-foreground leading-relaxed">
          Marking a holiday prevents attendance from being required for this class on the selected
          date. Sundays are automatically treated as holidays.
        </p>
      </div>

      <ConfirmDialog
        open={!!unmarkTarget}
        onOpenChange={(open) => !open && setUnmarkTarget(null)}
        title="Remove Holiday?"
        description={
          unmarkTarget
            ? `Remove holiday on ${prettyDate(unmarkTarget.date)}? Attendance may need to be re-marked.`
            : ""
        }
        confirmLabel="Remove"
        destructive
        onConfirm={confirmUnmark}
      />
    </div>
  );
}
