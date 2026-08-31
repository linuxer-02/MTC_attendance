import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { todayISO, prettyDate, isSundayISO } from "@/features/shared/date";
import { CheckCheck, Users, Palmtree, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STAFF_STATUS_META,
  staffStatusPillClass,
  useStaffMembers,
  useStaffAttendance,
  useStaffAttendanceInvalidator,
  type StaffStatus,
} from "@/features/staff/staffStatus";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function StaffMarkSection() {
  const [date, setDate] = useState(todayISO());
  const sunday = isSundayISO(date);
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const invalidateStaffAttendance = useStaffAttendanceInvalidator();

  const { data: staff } = useStaffMembers();
  const { data: dayRows } = useStaffAttendance(date, date);

  // Staff without a saved row for this date default to Present, same as the
  // student Mark page — nothing to do unless someone needs to be flagged.
  const savedStatusOf = (staffId: string) => dayRows?.find((r) => r.staff_id === staffId)?.status;
  const statusOf = (staffId: string): StaffStatus => savedStatusOf(staffId) ?? "present";
  const unsubmittedCount = (staff ?? []).filter((s) => !savedStatusOf(s.id)).length;

  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const handleDateChange = (nextDate: string) => {
    if (!sunday && unsubmittedCount > 0) {
      setPendingDate(nextDate);
      return;
    }
    setDate(nextDate);
  };

  const confirmDateChange = () => {
    if (pendingDate) setDate(pendingDate);
    setPendingDate(null);
  };

  const setStatus = async (staffId: string, status: StaffStatus) => {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return toast.error("Session expired. Please sign in again.");
    const { error } = await supabase
      .from("staff_attendance")
      .upsert({ staff_id: staffId, date, status, marked_by: uid }, { onConflict: "staff_id,date" });
    if (error) return toast.error(error.message);
    invalidateStaffAttendance();
  };

  const markAllPresent = async () => {
    if (sunday || !staff || staff.length === 0) return;
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return toast.error("Session expired. Please sign in again.");
    const rows = staff.map((s) => ({
      staff_id: s.id,
      date,
      status: "present" as StaffStatus,
      marked_by: uid,
    }));
    const { error } = await supabase
      .from("staff_attendance")
      .upsert(rows, { onConflict: "staff_id,date" });
    if (error) return toast.error(error.message);
    toast.success("All marked present ✓");
    invalidateStaffAttendance();
  };

  // Persists every staff member's current status in one go — for anyone
  // without a saved row yet, that's the default "present" — mirroring the
  // student Mark page's Submit button.
  const submitAll = async () => {
    if (sunday || !staff || staff.length === 0) return;
    setIsSubmitting(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) {
      setIsSubmitting(false);
      return toast.error("Session expired. Please sign in again.");
    }
    const rows = staff.map((s) => ({
      staff_id: s.id,
      date,
      status: statusOf(s.id),
      marked_by: uid,
    }));
    const { error } = await supabase
      .from("staff_attendance")
      .upsert(rows, { onConflict: "staff_id,date" });
    setIsSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Attendance submitted ✓");
    invalidateStaffAttendance();
  };

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="flex-1 rounded-xl border bg-card px-3 py-2.5 text-sm shadow-sm"
        />
        {!sunday && (
          <button
            onClick={markAllPresent}
            className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline shrink-0 px-2"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            All present
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{prettyDate(date)}</p>

      {sunday ? (
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <Palmtree className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm font-medium">It's Sunday</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sundays are automatic off — nothing to mark.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card overflow-hidden shadow-sm">
          {staff?.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
              No staff added yet. Add staff in the Roster section.
            </li>
          )}
          {(staff ?? []).map((s) => {
            const current = statusOf(s.id);
            const isDefaulted = !savedStatusOf(s.id);
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex items-center gap-1.5">
                  {isDefaulted && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                      title="Defaulted to Present — not yet submitted"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    {(s.designation || s.department) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {[s.designation, s.department].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
                <select
                  value={current}
                  onChange={(e) => setStatus(s.id, e.target.value as StaffStatus)}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-xs font-bold shrink-0",
                    staffStatusPillClass(current)
                  )}
                >
                  {STAFF_STATUS_META.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.code} · {m.label}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}

      {!sunday && (staff?.length ?? 0) > 0 && (
        <button
          type="button"
          onClick={submitAll}
          disabled={isSubmitting || unsubmittedCount === 0}
          className="w-full flex items-center justify-center gap-2 rounded-2xl gradient-primary text-primary-foreground py-3.5 text-sm font-medium shadow-lg btn-press disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSubmitting
            ? "Submitting..."
            : unsubmittedCount === 0
              ? "All submitted ✓"
              : `Submit (${unsubmittedCount} defaulted to Present)`}
        </button>
      )}

      <AlertDialog open={!!pendingDate} onOpenChange={(open) => !open && setPendingDate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubmitted attendance</AlertDialogTitle>
            <AlertDialogDescription>
              {unsubmittedCount} staff member{unsubmittedCount === 1 ? "" : "s"} default to Present
              but haven't been submitted for this date yet. Switch anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDateChange}>Switch anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
