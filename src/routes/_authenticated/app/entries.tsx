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
    search.month ?? format(new Date(), "yyyy-MM"),
  );

  // Set default class if not specified
  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const selectedClass = useMemo(() => classes?.find((c) => c.id === classId), [classes, classId]);

  // ----------------------------------------------------
  // Month calculation & intervals
  // ----------------------------------------------------
  const monthStart = useMemo(() => startOfMonth(parseISO(selectedMonth + "-01")), [selectedMonth]);
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
      if (!classId || !students || students.length === 0) return;

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) throw new Error("Session expired. Please sign in again.");

      const payload = students.map((s) => ({
        student_id: s.id,
        class_id: classId,
        date: selectedDate,
        status: dayEdits.get(s.id) ?? "present",
        marked_by: uid,
      }));

      const { error } = await supabase.from("attendance").upsert(payload, {
        onConflict: "student_id,date",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Attendance for ${prettyDate(selectedDate)} saved!`);
      queryClient.invalidateQueries({ queryKey: ["att-day-register"] });
      queryClient.invalidateQueries({ queryKey: ["att-week"] });
      queryClient.invalidateQueries({ queryKey: ["att-month-register"] });
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
      (err) => toast.error(err),
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
          <div className="inline-flex w-full sm:w-auto rounded-xl bg-muted p-1 border gap-1">
            <button
              onClick={() => setView("month")}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                view === "month"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
              Month View
            </button>
            <button
              onClick={() => setView("day")}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                view === "day"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
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
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
              <span className="text-xs text-muted-foreground font-medium">Display Mode:</span>
              <div className="inline-flex w-full sm:w-auto rounded-xl bg-muted p-1 border gap-1">
                <button
                  onClick={() => setMode("standard")}
                  className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    mode === "standard"
                      ? "gradient-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Standard Overview</span>
                  <span className="sm:hidden">Standard</span>
                </button>
                <button
                  onClick={() => setMode("excel")}
                  className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    mode === "excel"
                      ? "gradient-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">📊 Excel Grid Editor</span>
                  <span className="sm:hidden">Excel Grid</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:gap-3 pt-2 border-t">
            <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
              Select Past Date:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto rounded-xl border bg-background px-3.5 py-2 text-sm font-medium"
            />
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* VIEW MODE 1: DAY VIEW                                        */}
      {/* ============================================================ */}
      {view === "day" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl display">Register for {prettyDate(selectedDate)}</h2>
            <button
              onClick={() => saveDayMutation.mutate()}
              disabled={saveDayMutation.isPending}
              className="flex items-center gap-2 rounded-xl gradient-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-sm btn-press"
            >
              <Save className="h-4 w-4" />
              {saveDayMutation.isPending ? "Saving..." : "Save Day Register"}
            </button>
          </div>

          {/* Compact stats row — mobile/tablet only */}
          {students && students.length > 0 && (
            <div className="grid grid-cols-3 gap-2 lg:hidden">
              <div className="rounded-xl bg-success/10 border border-success/20 p-2.5 text-center">
                <div className="text-lg font-bold text-success">
                  {students.filter((s) => (dayEdits.get(s.id) ?? "present") === "present").length}
                </div>
                <div className="text-[9px] text-success/70 uppercase tracking-wide">Present</div>
              </div>
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-center">
                <div className="text-lg font-bold text-destructive">
                  {students.filter((s) => (dayEdits.get(s.id) ?? "present") === "absent").length}
                </div>
                <div className="text-[9px] text-destructive/70 uppercase tracking-wide">Absent</div>
              </div>
              <div className="rounded-xl bg-muted border p-2.5 text-center">
                {(() => {
                  const pct = Math.round(
                    (students.filter((s) => (dayEdits.get(s.id) ?? "present") === "present").length /
                      students.length) *
                      100,
                  );
                  return (
                    <div className={`text-lg font-bold ${pct >= 75 ? "text-success" : "text-destructive"}`}>
                      {pct}%
                    </div>
                  );
                })()}
                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Rate</div>
              </div>
            </div>
          )}

          {/* Desktop: 2-col (stats + list) · Mobile: stacked */}
          <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 space-y-4 lg:space-y-0 items-start">

            {/* Left stats panel — desktop only */}
            {students && students.length > 0 && (
              <div className="hidden lg:block sticky top-20 space-y-3">
                <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    Day Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-success/10 border border-success/20 p-3 text-center">
                      <div className="text-2xl font-bold text-success">
                        {students.filter((s) => (dayEdits.get(s.id) ?? "present") === "present").length}
                      </div>
                      <div className="text-[10px] text-success/70 uppercase tracking-wide mt-0.5">Present</div>
                    </div>
                    <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-center">
                      <div className="text-2xl font-bold text-destructive">
                        {students.filter((s) => (dayEdits.get(s.id) ?? "present") === "absent").length}
                      </div>
                      <div className="text-[10px] text-destructive/70 uppercase tracking-wide mt-0.5">Absent</div>
                    </div>
                  </div>
                  {(() => {
                    const pct = Math.round(
                      (students.filter((s) => (dayEdits.get(s.id) ?? "present") === "present").length /
                        students.length) *
                        100,
                    );
                    return (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground">Attendance rate</span>
                          <span className={`font-bold ${pct >= 75 ? "text-success" : "text-destructive"}`}>
                            {pct}%
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: pct >= 75 ? "var(--color-success)" : "var(--color-destructive)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <div className="text-xs text-muted-foreground border-t pt-3">
                    {students.length} total students
                  </div>
                </div>
              </div>
            )}

            {/* Student list — full-width on mobile, right col on desktop */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              {students && students.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/60 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                        <th className="px-4 py-3 text-left w-28">Roll No</th>
                        <th className="px-4 py-3 text-left">Name</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {students.map((s) => {
                        const status = dayEdits.get(s.id) ?? "present";
                        const isPresent = status === "present";
                        return (
                          <tr
                            key={s.id}
                            className={`transition-colors hover:bg-muted/30 ${!isPresent ? "bg-destructive/[0.04]" : ""}`}
                          >
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {s.roll_no}
                            </td>
                            <td className="px-4 py-3 font-medium whitespace-nowrap">{s.name}</td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                onClick={() => toggleDayStudent(s.id)}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all btn-press whitespace-nowrap ${
                                  isPresent
                                    ? "bg-success/15 text-success border border-success/30 hover:bg-success/25"
                                    : "bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25"
                                }`}
                              >
                                {isPresent ? (
                                  <><CheckCircle2 className="h-3.5 w-3.5" /> Present</>
                                ) : (
                                  <><XCircle className="h-3.5 w-3.5" /> Absent</>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No students found in this class.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW MODE 2: MONTH VIEW - OPTION A: STANDARD OVERVIEW       */}
      {/* ============================================================ */}
      {view === "month" && mode === "standard" && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-lg sm:text-xl display flex flex-wrap items-center gap-2">
                Monthly Overview
                <span className="text-muted-foreground text-sm sm:text-base font-normal">
                  ({format(monthStart, "MMMM yyyy")})
                </span>
              </h2>
              <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium self-start sm:self-auto">
                {students?.length ?? 0} students
              </span>
            </div>

            {/* Responsive table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left w-28">Roll No</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-center hidden sm:table-cell">Present</th>
                    <th className="px-4 py-3 text-center hidden sm:table-cell">Absent</th>
                    <th className="px-4 py-3 text-center hidden md:table-cell">Working Days</th>
                    <th className="px-4 py-3 text-center">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {students?.map((student) => {
                    let present = 0;
                    let absent = 0;
                    let totalWorking = 0;
                    daysInMonth.forEach((d) => {
                      if (d.isSunday || d.isHoliday) return;
                      totalWorking++;
                      const st = currentMatrixMap.get(`${student.id}|${d.date}`);
                      if (st === "present") present++;
                      else if (st === "absent") absent++;
                    });
                    const pct = totalWorking > 0 ? Math.round((present / totalWorking) * 100) : 0;
                    const isAtRisk = pct < 75 && totalWorking > 0;

                    return (
                      <tr
                        key={student.id}
                        className={`transition-colors hover:bg-muted/30 ${isAtRisk ? "bg-destructive/[0.03]" : ""}`}
                      >
                        <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{student.roll_no}</td>
                        <td className="px-4 py-3.5 font-medium">
                          <div className="flex items-center gap-2">
                            {student.name}
                            {isAtRisk && (
                              <span className="hidden sm:inline-flex text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full leading-none">
                                At Risk
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                          <span className="font-semibold text-success">{present}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                          <span className={`font-semibold ${absent > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {absent}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-muted-foreground hidden md:table-cell">
                          {totalWorking}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5 justify-end sm:justify-center">
                            <div className="hidden sm:block w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: pct >= 75 ? "var(--color-success)" : "var(--color-destructive)",
                                }}
                              />
                            </div>
                            <span
                              className={`text-xs font-bold w-10 text-right ${pct >= 75 ? "text-success" : "text-destructive"}`}
                            >
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW MODE 2: MONTH VIEW - OPTION B: INTERACTIVE EXCEL GRID  */}
      {/* ============================================================ */}
      {view === "month" && mode === "excel" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground flex items-center gap-1.5 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Excel Register
                </span>
                {unsavedCount > 0 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs font-bold animate-pulse">
                    {unsavedCount} unsaved edits
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-success/15 text-success text-[11px] font-medium">
                    ✓ All saved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-muted/60 text-xs font-medium hover:bg-muted cursor-pointer transition-colors btn-press">
                  <Upload className="h-3.5 w-3.5 text-primary" />
                  Import CSV
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
                <button
                  onClick={() => saveMonthMutation.mutate()}
                  disabled={unsavedCount === 0 || saveMonthMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all btn-press ${
                    unsavedCount > 0
                      ? "gradient-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveMonthMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>

          {/* Spreadsheet matrix */}
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {/* border-separate (not border-collapse) so the sticky Roll No/Name/Total%
                  columns actually stick — sticky positioning is broken by border-collapse
                  in every browser, which is what made this grid unscrollable-with-context
                  on mobile. border-spacing-0 keeps the visual seams identical to collapsed. */}
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="bg-muted/80 border-b text-muted-foreground font-semibold">
                    {/* Sticky: Roll No */}
                    <th className="sticky left-0 z-20 bg-muted/95 px-3 py-3 text-left w-28 border-r text-[11px] uppercase tracking-wide whitespace-nowrap">
                      Roll No
                    </th>
                    {/* Sticky: Name */}
                    <th className="sticky left-28 z-20 bg-muted/95 px-4 py-3 text-left w-52 border-r text-[11px] uppercase tracking-wide whitespace-nowrap shadow-[2px_0_8px_-2px_rgba(0,0,0,0.12)]">
                      Student Name
                    </th>
                    {/* Day columns */}
                    {daysInMonth.map((d) => (
                      <th
                        key={d.date}
                        className={`p-2 text-center min-w-[52px] border-r align-top ${
                          d.isSunday
                            ? "bg-muted/50 text-muted-foreground/50"
                            : d.isHoliday
                              ? "bg-accent/10 text-accent"
                              : ""
                        }`}
                      >
                        <div className="text-[9px] uppercase tracking-wide font-medium opacity-70">
                          {d.label.split(" ")[0]}
                        </div>
                        <div className="text-sm font-bold leading-tight mt-0.5">{d.dayNum}</div>
                        {!d.isSunday && !d.isHoliday && (
                          <div className="hidden sm:flex justify-center gap-0.5 mt-1.5">
                            <button
                              onClick={() => setColumnStatus(d.date, "present")}
                              title="Mark all Present"
                              className="text-[9px] w-5 h-4 rounded bg-success/20 text-success hover:bg-success/40 font-bold transition-colors"
                            >
                              P
                            </button>
                            <button
                              onClick={() => setColumnStatus(d.date, "absent")}
                              title="Mark all Absent"
                              className="text-[9px] w-5 h-4 rounded bg-destructive/20 text-destructive hover:bg-destructive/40 font-bold transition-colors"
                            >
                              A
                            </button>
                          </div>
                        )}
                      </th>
                    ))}
                    {/* Sticky right: student summary */}
                    <th className="sticky right-0 z-20 bg-muted/95 px-3 py-3 text-center min-w-[72px] border-l text-[11px] uppercase tracking-wide whitespace-nowrap shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.12)]">
                      Total %
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {students?.map((student) => {
                    let studentPresent = 0;
                    let studentAbsent = 0;
                    let studentWorkingDays = 0;
                    daysInMonth.forEach((d) => {
                      if (d.isSunday || d.isHoliday) return;
                      studentWorkingDays++;
                      const st = currentMatrixMap.get(`${student.id}|${d.date}`) ?? "unmarked";
                      if (st === "present") studentPresent++;
                      else if (st === "absent") studentAbsent++;
                    });
                    const studentPct =
                      studentWorkingDays > 0
                        ? Math.round((studentPresent / studentWorkingDays) * 100)
                        : 0;
                    const isAtRisk = studentPct < 75 && studentWorkingDays > 0;

                    return (
                      <tr
                        key={student.id}
                        className={`transition-colors hover:bg-muted/20 ${isAtRisk ? "bg-destructive/[0.03]" : ""}`}
                      >
                        {/* Sticky: Roll No */}
                        <td className="sticky left-0 z-10 bg-card px-3 py-2.5 font-mono text-[11px] text-muted-foreground border-r font-medium whitespace-nowrap">
                          {student.roll_no}
                        </td>
                        {/* Sticky: Name */}
                        <td className="sticky left-28 z-10 bg-card px-4 py-2.5 font-medium border-r max-w-[208px] truncate shadow-[2px_0_8px_-2px_rgba(0,0,0,0.12)] whitespace-nowrap">
                          {student.name}
                        </td>
                        {/* Day cells */}
                        {daysInMonth.map((d) => {
                          const cellKey = `${student.id}|${d.date}`;
                          const status = currentMatrixMap.get(cellKey) ?? "unmarked";
                          const isEdited = gridEdits.has(cellKey);

                          return (
                            <td
                              key={d.date}
                              onClick={() => toggleCell(student.id, d.date, status)}
                              className={`p-1.5 text-center border-r select-none transition-all ${
                                d.isSunday
                                  ? "bg-muted/20 cursor-not-allowed"
                                  : d.isHoliday
                                    ? "bg-accent/5 cursor-not-allowed"
                                    : "cursor-pointer hover:bg-muted/40"
                              } ${isEdited ? "ring-2 ring-primary ring-inset" : ""}`}
                            >
                              {d.isSunday ? (
                                <span className="text-[10px] text-muted-foreground/40">S</span>
                              ) : d.isHoliday ? (
                                <span className="text-[10px] text-accent font-bold" title={d.holidayReason}>
                                  H
                                </span>
                              ) : status === "present" ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-success text-success-foreground text-[11px] font-bold">
                                  P
                                </span>
                              ) : status === "absent" ? (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-destructive text-destructive-foreground text-[11px] font-bold">
                                  A
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted/60 text-muted-foreground/40 text-[11px]">
                                  –
                                </span>
                              )}
                            </td>
                          );
                        })}
                        {/* Sticky right: per-student summary */}
                        <td className="sticky right-0 z-10 bg-card border-l px-3 py-2.5 text-center shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.12)]">
                          <div className={`text-xs font-bold ${isAtRisk ? "text-destructive" : "text-success"}`}>
                            {studentPct}%
                          </div>
                          <div className="text-[10px] text-muted-foreground leading-none mt-0.5">
                            {studentPresent}/{studentWorkingDays}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Per-day totals summary row */}
                  {students && students.length > 0 && (
                    <tr className="bg-muted/60 border-t-2 border-muted-foreground/20">
                      <td className="sticky left-0 z-10 bg-muted/80 px-3 py-2.5 text-[11px] font-semibold text-muted-foreground border-r whitespace-nowrap">
                        Present/day
                      </td>
                      <td className="sticky left-28 z-10 bg-muted/80 px-4 py-2.5 text-[11px] text-muted-foreground border-r shadow-[2px_0_8px_-2px_rgba(0,0,0,0.12)] whitespace-nowrap">
                        {students.length} students
                      </td>
                      {daysInMonth.map((d) => {
                        if (d.isSunday)
                          return (
                            <td key={d.date} className="p-1.5 text-center border-r bg-muted/30">
                              <span className="text-[9px] text-muted-foreground/30">S</span>
                            </td>
                          );
                        if (d.isHoliday)
                          return (
                            <td key={d.date} className="p-1.5 text-center border-r bg-accent/5">
                              <span className="text-[9px] text-accent/50">H</span>
                            </td>
                          );
                        const dayPresent = students.filter(
                          (s) => (currentMatrixMap.get(`${s.id}|${d.date}`) ?? "unmarked") === "present",
                        ).length;
                        const dayPct = Math.round((dayPresent / students.length) * 100);
                        return (
                          <td key={d.date} className="p-1.5 text-center border-r">
                            <div
                              className={`text-[11px] font-bold ${
                                dayPct >= 75
                                  ? "text-success"
                                  : dayPresent > 0
                                    ? "text-destructive"
                                    : "text-muted-foreground/30"
                              }`}
                            >
                              {dayPresent > 0 ? dayPresent : "–"}
                            </div>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-muted/80 border-l px-3 py-2.5 text-center shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.12)]">
                        <div className="text-[10px] text-muted-foreground font-medium">/day</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="px-4 py-3 bg-muted/30 border-t flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-success text-success-foreground text-[9px] font-bold flex items-center justify-center">P</span>
                  Present
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">A</span>
                  Absent
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-accent/20 text-accent text-[9px] font-bold flex items-center justify-center">H</span>
                  Holiday
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-muted/60 text-muted-foreground/50 text-[9px] flex items-center justify-center">–</span>
                  Unmarked
                </span>
                {unsavedCount > 0 && (
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <span className="w-5 h-5 rounded-md ring-2 ring-primary bg-card text-[9px] flex items-center justify-center">✎</span>
                    Unsaved edit
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                💡 Click a cell to cycle: Present → Absent → Unmarked · Use P/A buttons for bulk column edits
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
