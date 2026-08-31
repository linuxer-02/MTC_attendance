import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessibleClasses } from "@/features/shared/roles";
import { isSundayISO, prettyDate, todayISO } from "@/features/shared/date";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, CheckCheck, Palmtree, ListChecks, Save } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ClassSelect } from "@/components/shared/ClassSelect";
import { attendancePct, pctBarColor, pctToneClass } from "@/features/shared/attendance";
import {
  currentUserId,
  useAttendanceInvalidator,
  useClassStudents,
} from "@/features/shared/attendanceQueries";
import { qk } from "@/features/shared/queryKeys";

const searchSchema = z.object({ classId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/app/mark")({
  head: () => ({ meta: [{ title: "Mark Attendance — Smart Attend Hub" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: MarkPage,
});

function MarkPage() {
  const { classId: initial } = Route.useSearch();
  const navigate = useNavigate();
  const { data: classes } = useMyAccessibleClasses();
  const [classId, setClassId] = useState<string | null>(initial || null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const today = todayISO();
  const invalidateAttendance = useAttendanceInvalidator();

  const { data: students } = useClassStudents(classId);

  const { data: existing, refetch } = useQuery({
    enabled: !!classId,
    queryKey: qk.attendance(classId, today, today),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("class_id", classId!)
        .eq("date", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: holiday } = useQuery({
    enabled: !!classId,
    queryKey: qk.holidays(classId, today, today),
    queryFn: async () => {
      const { data } = await supabase
        .from("class_holidays")
        .select("reason")
        .eq("class_id", classId!)
        .eq("date", today)
        .maybeSingle();
      return data;
    },
  });

  const initialMap = useMemo(() => {
    const m: Record<string, "present" | "absent"> = {};
    (existing ?? []).forEach((r) => {
      m[r.student_id] = r.status as any;
    });
    return m;
  }, [existing]);

  const [state, setState] = useState<Record<string, "present" | "absent">>({});
  useEffect(() => {
    setState(initialMap);
  }, [initialMap]);

  const saveAllAttendance = async (currentState: Record<string, "present" | "absent">) => {
    if (!classId || !students || students.length === 0) return true;
    const uid = await currentUserId();
    if (!uid) {
      toast.error("Session expired. Please sign in again.");
      return false;
    }
    const rows = students.map((s) => ({
      class_id: classId,
      student_id: s.id,
      date: today,
      status: (currentState[s.id] ?? "present") as "present" | "absent",
      marked_by: uid,
    }));
    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "student_id,date" });
    if (error) {
      toast.error(error.message);
      return false;
    }
    refetch();
    invalidateAttendance();
    return true;
  };

  // Toggling one student only writes that student's row, so concurrent
  // taps (or a second device marking the same class) can't clobber other
  // students' already-saved statuses by re-upserting a stale full roster.
  const saveSingleStatus = async (studentId: string, status: "present" | "absent") => {
    if (!classId) return false;
    const uid = await currentUserId();
    if (!uid) {
      toast.error("Session expired. Please sign in again.");
      return false;
    }
    const { error } = await supabase.from("attendance").upsert(
      {
        class_id: classId,
        student_id: studentId,
        date: today,
        status,
        marked_by: uid,
      },
      { onConflict: "student_id,date" },
    );
    if (error) {
      toast.error(error.message);
      return false;
    }
    refetch();
    invalidateAttendance();
    return true;
  };

  const setStatus = async (studentId: string, next: "present" | "absent") => {
    if (!classId) return;
    setState((prev) => ({ ...prev, [studentId]: next }));
    const ok = await saveSingleStatus(studentId, next);
    if (!ok) {
      setState((prev) => ({ ...prev, [studentId]: next === "absent" ? "present" : "absent" }));
    }
  };

  const markAllPresent = async () => {
    if (!classId || !students) return;
    const nextState: Record<string, "present" | "absent"> = {};
    students.forEach((s) => {
      nextState[s.id] = "present";
    });
    setState(nextState);
    const ok = await saveAllAttendance(nextState);
    if (ok) {
      toast.success("All marked present ✓");
    }
  };

  const handleSubmit = async () => {
    if (!classId) return;
    setIsSaving(true);
    const ok = await saveAllAttendance(state);
    setIsSaving(false);
    if (ok) toast.success("Attendance submitted ✓");
  };

  const goToAbsentees = () => {
    if (!classId) return;
    navigate({ to: "/app/absentees", search: { classId, date: today } });
  };

  const absent = (students ?? []).filter((s) => (state[s.id] ?? "present") === "absent");
  const presentCount = (students ?? []).length - absent.length;
  const total = students?.length ?? 0;
  const pct = attendancePct(presentCount, total);
  const markedCount = total;
  // Untouched (default-present) students only get persisted once "Submit" is
  // pressed — if fewer rows exist in the DB than students, this class isn't
  // fully saved yet, so switching away silently would drop those defaults.
  const needsSubmitConfirm = !!classId && total > 0 && (existing?.length ?? 0) < total;

  const [pendingClassId, setPendingClassId] = useState<string | null>(null);

  const handleClassChange = (newClassId: string) => {
    if (needsSubmitConfirm) {
      setPendingClassId(newClassId);
      return;
    }
    setClassId(newClassId);
  };

  const confirmClassChange = () => {
    if (pendingClassId) setClassId(pendingClassId);
    setPendingClassId(null);
  };

  if (isSundayISO(today)) {
    return (
      <div className="rounded-2xl border bg-card p-8 mt-6 text-center animate-slide-up shadow-sm">
        <div className="text-5xl mb-3">🌴</div>
        <h2 className="text-3xl display">It's Sunday</h2>
        <p className="text-sm text-muted-foreground mt-2">Sundays are automatic leave.</p>
      </div>
    );
  }

  if (holiday) {
    return (
      <div className="rounded-2xl border bg-accent/10 border-accent/20 p-8 mt-6 text-center animate-slide-up">
        <div className="text-5xl mb-3">🎉</div>
        <h2 className="text-3xl display">Holiday</h2>
        <p className="text-sm text-muted-foreground mt-2">{holiday.reason}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          {prettyDate(today)}
        </div>
        <ClassSelect
          classes={classes}
          value={classId}
          onChange={handleClassChange}
          className="mt-1.5 w-full"
        />
      </div>

      {/* Sticky stats bar */}
      <div className="sticky top-14 z-[5] -mx-4 px-4 py-3 glass-strong border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-success font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              {presentCount}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-destructive font-semibold">
              <XCircle className="h-4 w-4" />
              {absent.length}
            </span>
            <span className="text-muted-foreground text-xs">
              ({markedCount}/{total} marked)
            </span>
          </div>
          <button
            onClick={markAllPresent}
            className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            All present
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pctBarColor(pct) }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Attendance</span>
          <span className={`font-medium ${pctToneClass(pct)}`}>{pct}%</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Tap a student to toggle absent · tap again to mark present.
      </p>

      {/* Student list */}
      <ul className="divide-y rounded-2xl border bg-card overflow-hidden shadow-sm">
        {(students ?? []).map((s, i) => {
          const status = state[s.id];
          const isAbsent = status === "absent";
          return (
            <li key={s.id} className="animate-slide-up" style={{ animationDelay: `${i * 20}ms` }}>
              <button
                type="button"
                onClick={() => setStatus(s.id, isAbsent ? "present" : "absent")}
                className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors duration-150 ${
                  isAbsent ? "bg-destructive/8" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
                      isAbsent ? "bg-destructive/15" : "bg-success/15"
                    }`}
                  >
                    {isAbsent ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground min-w-18 max-w-30 truncate shrink-0">
                    {s.roll_no}
                  </span>
                  <span className="truncate font-medium">{s.name}</span>
                </div>
                <span
                  className={`text-xs font-bold tracking-wide transition-colors ${
                    isAbsent ? "text-destructive" : "text-success"
                  }`}
                >
                  {isAbsent ? "ABSENT" : "PRESENT"}
                </span>
              </button>
            </li>
          );
        })}
        {students?.length === 0 && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            <Palmtree className="h-8 w-8 mx-auto mb-2 opacity-30" />
            No students in this class yet. Ask your admin to upload the roster.
          </li>
        )}
      </ul>

      {/* Submit + View absentees — separate actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="flex items-center justify-center gap-2 rounded-2xl gradient-primary text-primary-foreground py-4 text-sm font-medium shadow-lg btn-press disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Submitting..." : "Submit"}
        </button>
        <button
          type="button"
          onClick={goToAbsentees}
          className="flex items-center justify-center gap-2 rounded-2xl border bg-card text-foreground py-4 text-sm font-medium shadow-sm btn-press hover:bg-muted/60 transition-colors"
        >
          <ListChecks className="h-4 w-4" />
          View Absentees
        </button>
      </div>

      <ConfirmDialog
        open={!!pendingClassId}
        onOpenChange={(open) => !open && setPendingClassId(null)}
        title="Unsubmitted attendance"
        description="You haven't submitted attendance for this class yet. Switch to another class anyway?"
        confirmLabel="Switch anyway"
        onConfirm={confirmClassChange}
      />
    </div>
  );
}
