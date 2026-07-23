import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessibleClasses, useMyRoles } from "@/features/shared/roles";
import { prettyDate, todayISO } from "@/features/shared/date";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  generateExcelCSV,
  downloadCSV,
  parseImportedCSV,
  AttendanceStatus,
  DayInfo,
} from "@/lib/excelExport";
import {
  CalendarDays,
  Calendar,
  FileSpreadsheet,
  Download,
  Upload,
  Save,
  CheckCircle2,
  XCircle,
  Clock,
  Check,
  Palmtree,
  Sparkles,
  LayoutGrid,
  ListFilter,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

const searchSchema = z.object({
  classId: z.string().optional(),
  date: z.string().optional(),
  month: z.string().optional(),
  view: z.enum(["day", "month"]).optional(),
  mode: z.enum(["standard", "excel"]).optional(),
});

export const Route = createFileRoute("/_authenticated/app/entries")({
  head: () => ({ meta: [{ title: "Register & Past Entries — Smart Attend Hub" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: RegisterEntriesPage,
});

type ViewType = "day" | "month";
type ModeType = "standard" | "excel";

function RegisterEntriesPage() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();

  const { data: roles } = useMyRoles();
  const { data: classes, isLoading: isLoadingClasses } = useMyAccessibleClasses();

  // Role permissions
  const isPrincipal = roles?.some((r) => r.role === "principal");
  const isHod = roles?.some((r) => r.role === "hod");
  const isIncharge = roles?.some((r) => r.role === "incharge");
  const canExport = isPrincipal || isHod || isIncharge;

  // View state
  const [view, setView] = useState<ViewType>(search.view ?? "month");
  const [mode, setMode] = useState<ModeType>(search.mode ?? "standard");
  const [classId, setClassId] = useState<string | null>(search.classId ?? null);
  const [selectedDate, setSelectedDate] = useState<string>(search.date ?? todayISO());
  const [selectedMonth, setSelectedMonth] = useState<string>(
    search.month ?? format(new Date(), "yyyy-MM")
  );

  // Set default class if not specified
  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const selectedClass = useMemo(
    () => classes?.find((c) => c.id === classId),
    [classes, classId]
  );

  // ----------------------------------------------------
  // Month calculation & intervals
  // ----------------------------------------------------
  const monthStart = useMemo(
    () => startOfMonth(parseISO(selectedMonth + "-01")),
    [selectedMonth]
  );
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);
  const monthFromStr = format(monthStart, "yyyy-MM-dd");
  const monthToStr = format(monthEnd, "yyyy-MM-dd");

  // ----------------------------------------------------
  // Database Queries
  // ----------------------------------------------------
  // 1. Students in class
  const { data: students } = useQuery({
    enabled: !!classId,
    queryKey: ["students", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, roll_no")
        .eq("class_id", classId!)
        .order("roll_no");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Month Attendance Query
  const { data: monthAttendance, isLoading: isLoadingMonthAtt } = useQuery({
    enabled: !!classId && view === "month",
    queryKey: ["att-month-register", classId, monthFromStr, monthToStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, date, status")
        .eq("class_id", classId!)
        .gte("date", monthFromStr)
        .lte("date", monthToStr);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Month Holidays Query
  const { data: monthHolidays } = useQuery({
    enabled: !!classId && view === "month",
    queryKey: ["holi-month-register", classId, monthFromStr, monthToStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_holidays")
        .select("date, reason")
        .eq("class_id", classId!)
        .gte("date", monthFromStr)
        .lte("date", monthToStr);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 4. Day Attendance Query (for Day View)
  const { data: dayAttendance, isLoading: isLoadingDayAtt } = useQuery({
    enabled: !!classId && view === "day",
    queryKey: ["att-day-register", classId, selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("class_id", classId!)
        .eq("date", selectedDate);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ----------------------------------------------------
  // Maps & Derived Data
  // ----------------------------------------------------
  const holidayMap = useMemo(() => {
    return Object.fromEntries((monthHolidays ?? []).map((h) => [h.date, h.reason]));
  }, [monthHolidays]);

  // Server state map for Month attendance
  const serverAttMap = useMemo(() => {
    const m = new Map<string, AttendanceStatus>();
    (monthAttendance ?? []).forEach((a) => {
      m.set(`${a.student_id}|${a.date}`, a.status as AttendanceStatus);
    });
    return m;
  }, [monthAttendance]);

  // Days array for the month
  const daysInMonth: DayInfo[] = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return days.map((d, index) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const sun = isSunday(d);
      const hol = !!holidayMap[dateStr];
      return {
        date: dateStr,
        dayNum: index + 1,
        label: format(d, "EEE d"),
        isSunday: sun,
        isHoliday: hol,
        holidayReason: holidayMap[dateStr],
      };
    });
  }, [monthStart, monthEnd, holidayMap]);

  // ----------------------------------------------------
  // Interactive Excel Grid State (Local Edits)
  // ----------------------------------------------------
  // Holds edits: `${student_id}|${date}` -> status
  const [gridEdits, setGridEdits] = useState<Map<string, AttendanceStatus>>(new Map());

  // Reset grid edits when month or class changes
  useEffect(() => {
    setGridEdits(new Map());
  }, [selectedMonth, classId]);

  // Combined Map: Server Map overwritten by Local Edits
  const currentMatrixMap = useMemo(() => {
    const combined = new Map<string, AttendanceStatus>(serverAttMap);
    gridEdits.forEach((val, key) => {
      combined.set(key, val);
    });
    return combined;
  }, [serverAttMap, gridEdits]);

  // Number of unsaved cell changes
  const unsavedCount = gridEdits.size;

  // Toggle single cell status in Excel grid
  const toggleCell = (studentId: string, dateStr: string, currentStatus: AttendanceStatus) => {
    const day = daysInMonth.find((d) => d.date === dateStr);
    if (day?.isSunday || day?.isHoliday) {
      toast.info(`Cannot edit attendance on ${day.isSunday ? "Sunday" : "Holiday"}`);
      return;
    }

    let nextStatus: AttendanceStatus = "present";
    if (currentStatus === "present") nextStatus = "absent";
    else if (currentStatus === "absent") nextStatus = "unmarked";
    else nextStatus = "present";

    const key = `${studentId}|${dateStr}`;
    setGridEdits((prev) => {
      const next = new Map(prev);
      const original = serverAttMap.get(key) ?? "unmarked";
      if (nextStatus === original) {
        next.delete(key);
      } else {
        next.set(key, nextStatus);
      }
      return next;
    });
  };

  // Quick column batch edit (Mark All Present / All Absent for a Day)
  const setColumnStatus = (dateStr: string, targetStatus: "present" | "absent") => {
    if (!students || students.length === 0) return;
    const day = daysInMonth.find((d) => d.date === dateStr);
    if (day?.isSunday || day?.isHoliday) {
      toast.info(`Cannot edit column on ${day.isSunday ? "Sunday" : "Holiday"}`);
      return;
    }

    setGridEdits((prev) => {
      const next = new Map(prev);
      students.forEach((s) => {
        const key = `${s.id}|${dateStr}`;
        const original = serverAttMap.get(key) ?? "unmarked";
        if (targetStatus === original) {
          next.delete(key);
        } else {
          next.set(key, targetStatus);
        }
      });
      return next;
    });
  };

  // ----------------------------------------------------
  // Day View Local Editing State
  // ----------------------------------------------------
  const [dayEdits, setDayEdits] = useState<Map<string, "present" | "absent">>(new Map());

  useEffect(() => {
    const initialMap = new Map<string, "present" | "absent">();
    (dayAttendance ?? []).forEach((a) => {
      initialMap.set(a.student_id, a.status as "present" | "absent");
    });
    setDayEdits(initialMap);
  }, [dayAttendance]);

  const toggleDayStudent = (studentId: string) => {
    setDayEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(studentId);
      if (current === "present") next.set(studentId, "absent");
      else next.set(studentId, "present");
      return next;
    });
  };

  // ----------------------------------------------------
  // Mutations: Save Batch Changes
  // ----------------------------------------------------
  // Save Month Grid Changes
  const saveMonthMutation = useMutation({
    mutationFn: async () => {
      if (!classId || gridEdits.size === 0) return;

      const payload: {
        student_id: string;
        class_id: string;
        date: string;
        status: "present" | "absent";
      }[] = [];
      const deleteKeys: { student_id: string; date: string }[] = [];

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id;

      gridEdits.forEach((status, key) => {
        const [student_id, date] = key.split("|");
        if (status === "unmarked") {
          deleteKeys.push({ student_id, date });
        } else if (status === "present" || status === "absent") {
          payload.push({
            student_id,
            class_id: classId,
            date,
            status,
            ...(currentUserId ? { marked_by: currentUserId } : {}),
          });
        }
      });

      // Upsert non-unmarked records
      if (payload.length > 0) {
        const { error } = await supabase.from("attendance").upsert(payload, {
          onConflict: "student_id,date",
        });
        if (error) throw error;
      }

      // Delete unmarked records
      if (deleteKeys.length > 0) {
        for (const item of deleteKeys) {
          const { error } = await supabase
            .from("attendance")
            .delete()
            .eq("student_id", item.student_id)
            .eq("date", item.date);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Excel grid changes saved successfully!");
      setGridEdits(new Map());
      queryClient.invalidateQueries({ queryKey: ["att-month-register"] });
      queryClient.invalidateQueries({ queryKey: ["att-week"] });
    },
    onError: (err: any) => {
      toast.error("Failed to save changes: " + err.message);
    },
  });

  // Save Day View Changes
  const saveDayMutation = useMutation({
    mutationFn: async () => {
      if (!classId || !students) return;

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) throw new Error("Session expired. Please sign in again.");

      const payload = Array.from(dayEdits.entries()).map(([student_id, status]) => ({
        student_id,
        class_id: classId,
        date: selectedDate,
        status,
        marked_by: uid,
      }));

      if (payload.length === 0) return;

      const { error } = await supabase.from("attendance").upsert(payload, {
        onConflict: "student_id,date",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Attendance for ${prettyDate(selectedDate)} saved!`);
      queryClient.invalidateQueries({ queryKey: ["att-day-register"] });
      queryClient.invalidateQueries({ queryKey: ["att-week"] });
    },
    onError: (err: any) => {
      toast.error("Failed to save day attendance: " + err.message);
    },
  });

  // ----------------------------------------------------
  // Excel Export Handler (Role Protected)
  // ----------------------------------------------------
  const handleExportExcel = () => {
    if (!canExport) {
      toast.error("You do not have permission to export attendance sheets.");
      return;
    }
    if (!selectedClass || !students) {
      toast.error("No class data available for export.");
      return;
    }

    try {
      const monthLabel = format(monthStart, "MMMM yyyy");
      const csv = generateExcelCSV({
        className: selectedClass.name,
        deptName: selectedClass.dept_name,
        yearLabel: selectedClass.year_label,
        monthLabel,
        students,
        days: daysInMonth,
        attendanceMap: currentMatrixMap,
      });

      const filename = `Attendance_${selectedClass.dept_name}_${selectedClass.name}_${selectedMonth}.csv`;
      downloadCSV(csv, filename);
      toast.success(`Excel sheet downloaded: ${filename}`);
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    }
  };

  // ----------------------------------------------------
  // Excel Import Handler
  // ----------------------------------------------------
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !students) return;

    parseImportedCSV(
      file,
      (updates) => {
        const studentRollMap = new Map(students.map((s) => [s.roll_no.trim().toLowerCase(), s.id]));
        let appliedCount = 0;

        setGridEdits((prev) => {
          const next = new Map(prev);
          updates.forEach(({ rollNo, dayNum, status }) => {
            const studentId = studentRollMap.get(rollNo.toLowerCase());
            const dayInfo = daysInMonth.find((d) => d.dayNum === dayNum);
            if (studentId && dayInfo && !dayInfo.isSunday && !dayInfo.isHoliday) {
              const key = `${studentId}|${dayInfo.date}`;
              const newStat: AttendanceStatus = status === "P" ? "present" : "absent";
              next.set(key, newStat);
              appliedCount++;
            }
          });
          return next;
        });

        toast.success(`Imported ${appliedCount} cell edits from CSV! Review and click Save.`);
        e.target.value = "";
      },
      (err) => toast.error(err)
    );
  };

  if (isLoadingClasses) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up pb-10">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl display flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            Past Register & Excel Editor
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            View past logs, toggle Day/Month register, edit via Excel grid & export sheets.
          </p>
        </div>

        {/* Export Excel Button (Role Enforcement) */}
        {canExport && (
          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 rounded-xl gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-md btn-press shrink-0"
          >
            <Download className="h-4 w-4" />
            Export Excel Sheet
          </button>
        )}
      </div>

      {/* Main Controls Card */}
      <div className="rounded-2xl border bg-card p-4 space-y-4 shadow-sm">
        {/* Class Selection & Primary View Toggle (Day vs Month) */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <select
            value={classId ?? ""}
            onChange={(e) => setClassId(e.target.value)}
            className="flex-1 rounded-xl border bg-background px-3.5 py-2.5 text-sm font-medium shadow-sm"
          >
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.dept_name} · {c.year_label} · {c.name}
              </option>
            ))}
          </select>

          {/* Day vs Month View Switcher */}
          <div className="inline-flex rounded-xl bg-muted p-1 border gap-1">
            <button
              onClick={() => setView("month")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view === "month"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              Month View
            </button>
            <button
              onClick={() => setView("day")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view === "day"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Day View
            </button>
          </div>
        </div>

        {/* View-Specific Inputs & Option Toggles */}
        {view === "month" ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center pt-2 border-t">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                Month:
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-xl border bg-background px-3 py-1.5 text-sm font-medium"
              />
            </div>

            {/* Separate Option Toggle for Interactive Excel Editor (as requested by user) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Display Mode:</span>
              <div className="inline-flex rounded-xl bg-muted p-1 border gap-1">
                <button
                  onClick={() => setMode("standard")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mode === "standard"
                      ? "gradient-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Standard Overview
                </button>
                <button
                  onClick={() => setMode("excel")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mode === "excel"
                      ? "gradient-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  📊 Excel Grid Editor
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 pt-2 border-t">
            <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Select Past Date:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border bg-background px-3.5 py-2 text-sm font-medium"
            />
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* VIEW MODE 1: DAY VIEW                                        */}
      {/* ============================================================ */}
      {view === "day" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl display">
              Register for {prettyDate(selectedDate)}
            </h2>
            <button
              onClick={() => saveDayMutation.mutate()}
              disabled={saveDayMutation.isPending}
              className="flex items-center gap-2 rounded-xl gradient-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-sm btn-press"
            >
              <Save className="h-4 w-4" />
              {saveDayMutation.isPending ? "Saving..." : "Save Day Register"}
            </button>
          </div>

          {/* Student Status List */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-2">
            {students && students.length > 0 ? (
              <div className="divide-y">
                {students.map((s) => {
                  const status = dayEdits.get(s.id) ?? "present";
                  const isPresent = status === "present";
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-3 px-1 hover:bg-muted/40 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground w-16 truncate shrink-0">
                          {s.roll_no}
                        </span>
                        <span className="font-medium text-sm truncate">{s.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => toggleDayStudent(s.id)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all btn-press ${
                            isPresent
                              ? "bg-success/15 text-success border border-success/30"
                              : "bg-destructive/15 text-destructive border border-destructive/30"
                          }`}
                        >
                          {isPresent ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" /> Present
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5" /> Absent
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No students found in this class.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW MODE 2: MONTH VIEW - OPTION A: STANDARD OVERVIEW       */}
      {/* ============================================================ */}
      {view === "month" && mode === "standard" && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
            <h2 className="text-xl display flex items-center justify-between">
              <span>Monthly Overview ({format(monthStart, "MMMM yyyy")})</span>
              <span className="text-xs font-normal text-muted-foreground">
                {students?.length ?? 0} Students
              </span>
            </h2>

            {/* Student List with Month % */}
            <div className="divide-y text-sm">
              {students?.map((student) => {
                let present = 0;
                let totalWorking = 0;
                daysInMonth.forEach((d) => {
                  if (d.isSunday || d.isHoliday) return;
                  totalWorking++;
                  const st = currentMatrixMap.get(`${student.id}|${d.date}`);
                  if (st === "present") present++;
                });

                const pct = totalWorking > 0 ? Math.round((present / totalWorking) * 100) : 0;

                return (
                  <div key={student.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground w-16 truncate shrink-0">
                        {student.roll_no}
                      </span>
                      <span className="font-medium truncate">{student.name}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{present}</span> / {totalWorking} days
                      </div>
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background:
                              pct >= 75 ? "var(--color-success)" : "var(--color-destructive)",
                          }}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold w-10 text-right ${
                          pct >= 75 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW MODE 2: MONTH VIEW - OPTION B: INTERACTIVE EXCEL GRID  */}
      {/* ============================================================ */}
      {view === "month" && mode === "excel" && (
        <div className="space-y-4">
          {/* Action Toolbar for Excel Grid */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Excel Interactive Editor
              </span>
              {unsavedCount > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full bg-accent/20 text-accent font-bold animate-pulse">
                  {unsavedCount} unsaved cell edits
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  All saved
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Import CSV */}
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-muted/60 text-xs font-medium hover:bg-muted cursor-pointer transition-colors btn-press">
                <Upload className="h-3.5 w-3.5 text-primary" />
                Import CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* Save Batch Changes */}
              <button
                onClick={() => saveMonthMutation.mutate()}
                disabled={unsavedCount === 0 || saveMonthMutation.isPending}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all btn-press ${
                  unsavedCount > 0
                    ? "gradient-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                {saveMonthMutation.isPending ? "Saving..." : "Save Grid Changes"}
              </button>
            </div>
          </div>

          {/* Full Spreadsheet Matrix Container */}
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-w-full">
              <table className="w-full text-xs border-collapse">
                {/* Table Header (Sticky Roll No & Name, Days 1..N) */}
                <thead>
                  <tr className="bg-muted/80 border-b text-muted-foreground font-semibold">
                    <th className="sticky left-0 z-10 bg-muted/95 p-3 text-left w-24 border-r">
                      Roll No
                    </th>
                    <th className="sticky left-24 z-10 bg-muted/95 p-3 text-left w-40 border-r shadow-sm">
                      Name
                    </th>
                    {daysInMonth.map((d) => (
                      <th
                        key={d.date}
                        className={`p-2 text-center min-w-[42px] border-r ${
                          d.isSunday
                            ? "bg-muted/40 text-muted-foreground/60"
                            : d.isHoliday
                              ? "bg-accent/10 text-accent font-bold"
                              : ""
                        }`}
                      >
                        <div className="text-[10px] uppercase">{d.label.split(" ")[0]}</div>
                        <div className="text-xs font-bold">{d.dayNum}</div>
                        {!d.isSunday && !d.isHoliday && (
                          <div className="flex justify-center gap-0.5 mt-1">
                            <button
                              onClick={() => setColumnStatus(d.date, "present")}
                              title="Mark column Present"
                              className="text-[9px] px-1 rounded bg-success/20 text-success hover:bg-success/40"
                            >
                              P
                            </button>
                            <button
                              onClick={() => setColumnStatus(d.date, "absent")}
                              title="Mark column Absent"
                              className="text-[9px] px-1 rounded bg-destructive/20 text-destructive hover:bg-destructive/40"
                            >
                              A
                            </button>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Table Body (Students x Days matrix) */}
                <tbody className="divide-y">
                  {students?.map((student) => (
                    <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-card p-2.5 font-mono text-muted-foreground border-r font-medium">
                        {student.roll_no}
                      </td>
                      <td className="sticky left-24 z-10 bg-card p-2.5 font-medium border-r truncate max-w-[160px] shadow-sm">
                        {student.name}
                      </td>
                      {daysInMonth.map((d) => {
                        const cellKey = `${student.id}|${d.date}`;
                        const status = currentMatrixMap.get(cellKey) ?? "unmarked";
                        const isEdited = gridEdits.has(cellKey);

                        return (
                          <td
                            key={d.date}
                            onClick={() => toggleCell(student.id, d.date, status)}
                            className={`p-1.5 text-center border-r select-none cursor-pointer transition-all ${
                              d.isSunday
                                ? "bg-muted/30 cursor-not-allowed"
                                : d.isHoliday
                                  ? "bg-accent/5 cursor-not-allowed"
                                  : "hover:scale-105"
                            } ${isEdited ? "ring-2 ring-primary ring-inset" : ""}`}
                          >
                            {d.isSunday ? (
                              <span className="text-[10px] text-muted-foreground/60 font-medium">
                                S
                              </span>
                            ) : d.isHoliday ? (
                              <span className="text-[10px] text-accent font-bold" title={d.holidayReason}>
                                H
                              </span>
                            ) : status === "present" ? (
                              <span className="inline-block w-6 h-6 rounded-md bg-success text-success-foreground text-[11px] font-bold leading-6 shadow-2xs">
                                P
                              </span>
                            ) : status === "absent" ? (
                              <span className="inline-block w-6 h-6 rounded-md bg-destructive text-destructive-foreground text-[11px] font-bold leading-6 shadow-2xs">
                                A
                              </span>
                            ) : (
                              <span className="inline-block w-6 h-6 rounded-md bg-muted text-muted-foreground/60 text-[11px] font-medium leading-6">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Spreadsheet Footer Legend */}
            <div className="p-3 bg-muted/40 border-t flex flex-wrap items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-success text-success-foreground text-[9px] font-bold flex items-center justify-center">
                    P
                  </span>{" "}
                  Present
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                    A
                  </span>{" "}
                  Absent
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-accent/20 text-accent text-[9px] font-bold flex items-center justify-center">
                    H
                  </span>{" "}
                  Holiday
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded bg-muted text-muted-foreground text-[9px] font-medium flex items-center justify-center">
                    -
                  </span>{" "}
                  Unmarked
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                💡 Tip: Click any cell to cycle status (Present ➔ Absent ➔ Unmarked). Use column "P/A" buttons for bulk day marking.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
