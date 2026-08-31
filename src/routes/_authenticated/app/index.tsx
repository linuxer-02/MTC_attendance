import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMyAccessibleClasses } from "@/features/shared/roles";
import { currentWeekDays, isSundayISO, prettyDate, todayISO } from "@/features/shared/date";
import { CalendarCheck2, ChevronRight, Palmtree, Pencil, BarChart2 } from "lucide-react";
import { ClassSelect } from "@/components/shared/ClassSelect";
import { StatTiles } from "@/components/shared/StatTiles";
import {
  useClassStudents,
  useClassAttendance,
  useClassHolidays,
} from "@/features/shared/attendanceQueries";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "This week — Smart Attend Hub" }] }),
  component: WeekView,
});

function WeekView() {
  const { data: classes, isLoading } = useMyAccessibleClasses();
  const [classId, setClassId] = useState<string | null>(null);
  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const week = useMemo(() => currentWeekDays(), []);
  const from = week[0].date;
  const to = week[6].date;

  const { data: students } = useClassStudents(classId);
  const { data: attendance } = useClassAttendance(classId, from, to);
  const { data: holidays } = useClassHolidays(classId, from, to);

  const attMap = useMemo(() => {
    const m = new Map<string, "present" | "absent">();
    (attendance ?? []).forEach((a) => m.set(`${a.student_id}|${a.date}`, a.status as any));
    return m;
  }, [attendance]);

  const today = todayISO();

  // Weekly summary stats
  const weekStats = useMemo(() => {
    let totalMarked = 0;
    let totalPresent = 0;
    const total = students?.length ?? 0;
    week.forEach((d) => {
      if (d.sunday || holidays?.has(d.date)) return;
      (students ?? []).forEach((s) => {
        const st = attMap.get(`${s.id}|${d.date}`);
        if (st === "present") {
          totalPresent++;
          totalMarked++;
        } else if (st === "absent") totalMarked++;
      });
    });
    return { totalPresent, totalMarked, total };
  }, [week, students, attMap, holidays]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  if (!classes || classes.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-8 mt-6 text-center animate-slide-up shadow-sm">
        <div className="text-5xl mb-3">🏫</div>
        <h2 className="text-3xl display">No class yet</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          You aren't assigned to a class yet. Ask your admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Class selector */}
      <div className="flex items-center gap-2">
        <ClassSelect
          classes={classes}
          value={classId}
          onChange={setClassId}
          className="flex-1 min-w-0"
        />
        <Link
          to="/app/analytics"
          className="p-2.5 rounded-xl border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all shadow-sm shrink-0 btn-press"
          title="View Analytics"
        >
          <BarChart2 className="h-4 w-4" />
        </Link>
        <Link
          to="/app/mark"
          search={{ classId: classId ?? "" }}
          className="flex items-center gap-1.5 rounded-xl gradient-primary text-primary-foreground px-3.5 py-2.5 text-sm shrink-0 shadow-sm btn-press"
        >
          <Pencil className="h-3.5 w-3.5" />
          Mark
        </Link>
      </div>

      {/* Weekly stats pills */}
      {weekStats.totalMarked > 0 && (
        <StatTiles
          tiles={[
            { label: "Present", value: weekStats.totalPresent, tone: "text-success" },
            {
              label: "Absent",
              value: weekStats.totalMarked - weekStats.totalPresent,
              tone: "text-destructive",
            },
            {
              label: "Avg %",
              value:
                weekStats.totalMarked > 0
                  ? Math.round((weekStats.totalPresent / weekStats.totalMarked) * 100) + "%"
                  : "—",
              tone: "text-primary",
            },
          ]}
        />
      )}

      {/* Weekly grid */}
      <div>
        <h2 className="text-3xl display mb-3 flex items-center gap-2">
          <CalendarCheck2 className="h-6 w-6 text-primary" />
          This week
        </h2>
        <div className="grid grid-cols-7 gap-1.5 stagger-children">
          {week.map((d) => {
            const isHoliday = holidays?.has(d.date);
            const isSun = d.sunday;
            let absentCount = 0,
              presentCount = 0;
            (students ?? []).forEach((s) => {
              const st = attMap.get(`${s.id}|${d.date}`);
              if (st === "absent") absentCount++;
              else if (st === "present") presentCount++;
            });
            const dayLabel = d.label.split(" ");
            const isToday = d.date === today;
            const total = presentCount + absentCount;
            const pct = total > 0 ? presentCount / total : null;

            return (
              <div
                key={d.date}
                className={`rounded-xl p-1.5 text-center text-xs border transition-all animate-slide-up ${
                  isToday
                    ? "ring-2 ring-primary shadow-md bg-primary/5"
                    : isSun || isHoliday
                      ? "bg-muted/60"
                      : "bg-card"
                }`}
              >
                <div className="text-[9px] uppercase text-muted-foreground font-medium">
                  {dayLabel[0]}
                </div>
                <div className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
                  {dayLabel[1]}
                </div>

                {isSun ? (
                  <div className="text-[9px] text-muted-foreground mt-1">Sun</div>
                ) : isHoliday ? (
                  <div className="text-[9px] mt-1 text-accent" title="Holiday">
                    <Palmtree className="h-3 w-3 mx-auto" />
                  </div>
                ) : pct !== null ? (
                  <div className="mt-1.5">
                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct * 100}%`,
                          background:
                            pct >= 0.75 ? "var(--color-success)" : "var(--color-destructive)",
                        }}
                      />
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {Math.round(pct * 100)}%
                    </div>
                  </div>
                ) : (
                  <div className="text-[9px] text-muted-foreground mt-1">—</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's action */}
      <div>
        <h3 className="text-2xl display mb-2">Today · {prettyDate(today)}</h3>
        {isSundayISO(today) ? (
          <div className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">
            <div className="text-3xl mb-2">🌴</div>
            Sunday — rest day, no attendance.
          </div>
        ) : holidays?.has(today) ? (
          <div className="rounded-2xl bg-accent/10 border border-accent/20 p-5 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-sm font-medium">Holiday</p>
          </div>
        ) : (
          <Link
            to="/app/mark"
            search={{ classId: classId ?? "" }}
            className="flex items-center justify-between rounded-2xl gradient-primary text-primary-foreground p-5 shadow-lg btn-press group"
          >
            <div>
              <div className="display text-2xl font-semibold">Open today's register</div>
              <div className="text-xs text-primary-foreground/70 mt-0.5">
                Mark attendance for today
              </div>
            </div>
            <ChevronRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}

        <Link
          to="/app/holiday"
          search={{ classId: classId ?? "" }}
          className="flex items-center justify-center gap-1.5 mt-3 text-sm text-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Palmtree className="h-3.5 w-3.5" />
          Mark day as holiday
        </Link>
      </div>
    </div>
  );
}
