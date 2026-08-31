import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMyAccessibleClasses } from "@/features/shared/roles";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Trophy,
  CalendarDays,
  GraduationCap,
} from "lucide-react";
import { todayISO } from "@/features/shared/date";
import {
  ELIGIBILITY_META,
  MIN_ATTENDANCE_PCT,
  attendancePct,
  defaultAcademicYearStart,
  eligibilityOf,
  pctBarColor,
  pctToneClass,
  workingDaysBetween,
} from "@/features/shared/attendance";
import {
  useClassAttendance,
  useClassHolidays,
  useClassStudents,
} from "@/features/shared/attendanceQueries";
import { ClassSelect } from "@/components/shared/ClassSelect";
import { StatTiles } from "@/components/shared/StatTiles";
import { RosterIdentity } from "@/components/shared/RosterIdentity";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Smart Attend Hub" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: classes } = useMyAccessibleClasses();
  const [classId, setClassId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [yearStart, setYearStart] = useState(defaultAcademicYearStart);
  const today = todayISO();

  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const monthStart = startOfMonth(parseISO(month + "-01"));
  const monthEnd = endOfMonth(monthStart);
  const from = format(monthStart, "yyyy-MM-dd");
  const to = format(monthEnd, "yyyy-MM-dd");

  const { data: students } = useClassStudents(classId);
  const { data: attendance } = useClassAttendance(classId, from, to);
  const { data: holidays } = useClassHolidays(classId, from, to);

  const workingDays = useMemo(() => workingDaysBetween(from, to, holidays), [from, to, holidays]);

  // ── Cumulative academic-year attendance + Anna University R-2025 exam
  // eligibility — independent of the month picker above, spans yearStart..today.
  const yearStartValid = yearStart <= today;
  const { data: yearAttendance } = useClassAttendance(classId, yearStart, today, {
    enabled: yearStartValid,
  });
  const { data: yearHolidays } = useClassHolidays(classId, yearStart, today, {
    enabled: yearStartValid,
  });

  const yearWorkingDays = useMemo(
    () => (yearStartValid ? workingDaysBetween(yearStart, today, yearHolidays) : []),
    [yearStart, today, yearStartValid, yearHolidays],
  );

  const eligibilityStats = useMemo(() => {
    const total = yearWorkingDays.length;
    return (students ?? []).map((s) => {
      const presentDays = (yearAttendance ?? []).filter(
        (a) => a.student_id === s.id && a.status === "present",
      ).length;
      const pct = attendancePct(presentDays, total);
      return { ...s, presentDays, total, pct, status: eligibilityOf(pct) };
    });
  }, [students, yearAttendance, yearWorkingDays]);

  const eligibilityCounts = useMemo(
    () => ({
      eligible: eligibilityStats.filter((s) => s.status === "eligible").length,
      condonation: eligibilityStats.filter((s) => s.status === "condonation").length,
      ineligible: eligibilityStats.filter((s) => s.status === "ineligible").length,
    }),
    [eligibilityStats],
  );

  // Daily attendance chart data
  const dailyData = useMemo(() => {
    const total = students?.length ?? 0;
    if (!total) return [];
    return workingDays.map((date) => {
      const presentCount = (attendance ?? []).filter(
        (a) => a.date === date && a.status === "present",
      ).length;
      const markedCount = (attendance ?? []).filter((a) => a.date === date).length;
      const pct = markedCount > 0 ? attendancePct(presentCount, total) : null;
      return {
        date,
        label: format(parseISO(date), "d"),
        pct,
        present: presentCount,
        absent: total - presentCount,
        marked: markedCount > 0,
      };
    });
  }, [workingDays, attendance, students]);

  // Per-student stats
  const studentStats = useMemo(() => {
    const total = workingDays.length;
    return (students ?? []).map((s) => {
      const presentDays = (attendance ?? []).filter(
        (a) => a.student_id === s.id && a.status === "present",
      ).length;
      return { ...s, presentDays, total, pct: attendancePct(presentDays, total) };
    });
  }, [students, attendance, workingDays]);

  const atRisk = studentStats.filter((s) => s.pct < MIN_ATTENDANCE_PCT && s.total > 0);
  const excellent = studentStats.filter((s) => s.pct >= 95 && s.total > 0);

  const avgPct = useMemo(() => {
    const valid = dailyData.filter((d) => d.pct !== null);
    if (!valid.length) return 0;
    return Math.round(valid.reduce((a, d) => a + (d.pct ?? 0), 0) / valid.length);
  }, [dailyData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-xl border bg-card p-3 shadow-lg text-xs">
        <p className="font-medium mb-1">{format(parseISO(d.date), "EEE, MMM d")}</p>
        {d.marked ? (
          <>
            <p className="text-success">{d.present} present</p>
            <p className="text-destructive">{d.absent} absent</p>
            <p className="font-bold mt-1">{d.pct}% attendance</p>
          </>
        ) : (
          <p className="text-muted-foreground">Not marked</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
          <CalendarDays className="h-4 w-4 text-primary-foreground" />
        </span>
        Analytics
      </h1>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-2">
        <ClassSelect classes={classes} value={classId} onChange={setClassId} />
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border bg-card px-3 py-2.5 text-sm shadow-sm"
        />
      </div>

      {/* Academic-year cumulative attendance & exam eligibility (Anna University R-2025) */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-xl display flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Exam Eligibility · Anna University R-2025
          </h2>
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-muted-foreground uppercase tracking-wide font-medium">
              Academic year from
            </label>
            <input
              type="date"
              value={yearStart}
              max={today}
              onChange={(e) => setYearStart(e.target.value)}
              className="rounded-lg border bg-background px-2 py-1.5 text-xs font-medium"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Cumulative attendance from the academic year start date through today (
          {format(parseISO(today), "MMM d, yyyy")}). Per the regulation:{" "}
          <b className="text-success">≥75%</b> is eligible for the university exam,{" "}
          <b className="text-accent">65–74%</b> requires condonation by the Head of Institution, and{" "}
          <b className="text-destructive">&lt;65%</b> is not eligible.
        </p>

        {!yearStartValid ? (
          <div className="rounded-xl border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
            Academic year start must be on or before today.
          </div>
        ) : (
          <>
            {/* Eligibility summary */}
            <StatTiles
              tiles={(["eligible", "condonation", "ineligible"] as const).map((key) => ({
                label: ELIGIBILITY_META[key].label,
                value: eligibilityCounts[key],
                tone: ELIGIBILITY_META[key].toneClass,
                icon: ELIGIBILITY_META[key].icon,
                tileClass: ELIGIBILITY_META[key].badgeClass,
              }))}
            />

            {/* Per-student eligibility table */}
            {eligibilityStats.length > 0 ? (
              <ul className="divide-y text-sm">
                {eligibilityStats
                  .slice()
                  .sort((a, b) => a.pct - b.pct)
                  .map((s) => {
                    const meta = ELIGIBILITY_META[s.status];
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                        <RosterIdentity rollNo={s.roll_no} name={s.name} />
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {s.presentDays}/{s.total}
                          </span>
                          <span className={`font-bold text-xs w-10 text-right ${meta.toneClass}`}>
                            {s.pct}%
                          </span>
                          <span
                            className={`text-[10px] font-semibold rounded-full px-2 py-1 border whitespace-nowrap ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <div className="rounded-xl border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
                No students in this class.
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary pills */}
      <StatTiles
        tiles={[
          {
            label: "Avg Attendance",
            value: `${avgPct}%`,
            tone: pctToneClass(avgPct),
            icon: avgPct >= MIN_ATTENDANCE_PCT ? TrendingUp : TrendingDown,
          },
          {
            label: "Working Days",
            value: workingDays.length,
            tone: "text-primary",
            icon: CalendarDays,
          },
          {
            label: "Students",
            value: students?.length ?? 0,
            tone: "text-accent",
            icon: AlertTriangle,
          },
        ]}
      />

      {/* Daily attendance chart */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="text-xl display mb-4">Daily Attendance %</h2>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={24}>
                {dailyData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.pct === null ? "var(--color-border)" : pctBarColor(d.pct)}
                    opacity={d.pct === null ? 0.3 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
            No data for this month yet.
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          Green = ≥75% · Red = below 75% · Grey = not marked
        </p>
      </div>

      {/* At-risk students */}
      {atRisk.length > 0 && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 shadow-sm">
          <h2 className="text-xl display mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            At-Risk Students ({atRisk.length})
          </h2>
          <ul className="divide-y divide-destructive/10">
            {atRisk
              .slice()
              .sort((a, b) => a.pct - b.pct)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm min-w-0">
                  <RosterIdentity rollNo={s.roll_no} name={s.name} emphasis />
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-destructive"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                    <span className="text-destructive font-bold text-xs w-10 text-right">
                      {s.pct}%
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Excellent attendance */}
      {excellent.length > 0 && (
        <div className="rounded-2xl border border-success/20 bg-success/5 p-4 shadow-sm">
          <h2 className="text-xl display mb-3 flex items-center gap-2 text-success">
            <Trophy className="h-5 w-5" />
            Perfect Attendance ({excellent.length})
          </h2>
          <ul className="divide-y divide-success/10">
            {excellent
              .slice()
              .sort((a, b) => b.pct - a.pct)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm min-w-0">
                  <RosterIdentity rollNo={s.roll_no} name={s.name} emphasis />
                  <span className="text-success font-bold text-xs">{s.pct}%</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Full student table */}
      {studentStats.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-xl display mb-3">All Students</h2>
          <ul className="divide-y text-sm">
            {studentStats
              .slice()
              .sort((a, b) => a.pct - b.pct)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5">
                  <RosterIdentity rollNo={s.roll_no} name={s.name} />
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${s.pct}%`, background: pctBarColor(s.pct) }}
                      />
                    </div>
                    <span className={`font-bold text-xs w-10 text-right ${pctToneClass(s.pct)}`}>
                      {s.pct}%
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
