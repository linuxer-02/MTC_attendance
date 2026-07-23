import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessibleClasses } from "@/features/shared/roles";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday, parseISO } from "date-fns";
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
import { TrendingDown, TrendingUp, AlertTriangle, Trophy, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Smart Attend Hub" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: classes } = useMyAccessibleClasses();
  const [classId, setClassId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));

  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const monthStart = startOfMonth(parseISO(month + "-01"));
  const monthEnd = endOfMonth(monthStart);
  const from = format(monthStart, "yyyy-MM-dd");
  const to = format(monthEnd, "yyyy-MM-dd");

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

  const { data: attendance } = useQuery({
    enabled: !!classId,
    queryKey: ["att-month", classId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, date, status")
        .eq("class_id", classId!)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: holidays } = useQuery({
    enabled: !!classId,
    queryKey: ["holi-month", classId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_holidays")
        .select("date")
        .eq("class_id", classId!)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return new Set((data ?? []).map((h) => h.date));
    },
  });

  // Working days in month (no Sundays, no holidays)
  const workingDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return days
      .filter((d) => !isSunday(d))
      .map((d) => format(d, "yyyy-MM-dd"))
      .filter((d) => !holidays?.has(d));
  }, [monthStart, monthEnd, holidays]);

  // Daily attendance chart data
  const dailyData = useMemo(() => {
    const total = students?.length ?? 0;
    if (!total) return [];
    return workingDays.map((date) => {
      const presentCount = (attendance ?? []).filter(
        (a) => a.date === date && a.status === "present",
      ).length;
      const markedCount = (attendance ?? []).filter((a) => a.date === date).length;
      const pct = markedCount > 0 ? Math.round((presentCount / total) * 100) : null;
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
      const markedDays = (attendance ?? []).filter((a) => a.student_id === s.id).length;
      const pct = total > 0 ? Math.round((presentDays / total) * 100) : 0;
      return { ...s, presentDays, markedDays, total, pct };
    });
  }, [students, attendance, workingDays]);

  const atRisk = studentStats.filter((s) => s.pct < 75 && s.total > 0);
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
        <select
          value={classId ?? ""}
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-xl border bg-card px-3 py-2.5 text-sm shadow-sm"
        >
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.dept_name} · {c.year_label} · {c.name}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border bg-card px-3 py-2.5 text-sm shadow-sm"
        />
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-3 gap-2 stagger-children">
        {[
          {
            label: "Avg Attendance",
            value: `${avgPct}%`,
            color: avgPct >= 75 ? "text-success" : "text-destructive",
            icon: avgPct >= 75 ? TrendingUp : TrendingDown,
          },
          {
            label: "Working Days",
            value: workingDays.length,
            color: "text-primary",
            icon: CalendarDays,
          },
          {
            label: "Students",
            value: students?.length ?? 0,
            color: "text-accent",
            icon: AlertTriangle,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border bg-card p-3 text-center shadow-sm card-hover animate-slide-up"
          >
            <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
            <div className={`text-2xl display font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] uppercase text-muted-foreground mt-0.5 tracking-wide leading-tight">
              {s.label}
            </div>
          </div>
        ))}
      </div>

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
                    fill={
                      d.pct === null
                        ? "var(--color-border)"
                        : (d.pct ?? 0) >= 75
                          ? "var(--color-success)"
                          : "var(--color-destructive)"
                    }
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
              .sort((a, b) => a.pct - b.pct)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground min-w-[4.5rem] max-w-[7.5rem] truncate shrink-0">
                      {s.roll_no}
                    </span>
                    <span className="font-medium truncate">{s.name}</span>
                  </div>
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
              .sort((a, b) => b.pct - a.pct)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground min-w-[4.5rem] max-w-[7.5rem] truncate shrink-0">
                      {s.roll_no}
                    </span>
                    <span className="font-medium truncate">{s.name}</span>
                  </div>
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
              .sort((a, b) => a.pct - b.pct)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-muted-foreground min-w-[4.5rem] max-w-[7.5rem] truncate shrink-0">
                      {s.roll_no}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${s.pct}%`,
                          background:
                            s.pct >= 75 ? "var(--color-success)" : "var(--color-destructive)",
                        }}
                      />
                    </div>
                    <span
                      className={`font-bold text-xs w-10 text-right ${
                        s.pct >= 75 ? "text-success" : "text-destructive"
                      }`}
                    >
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
