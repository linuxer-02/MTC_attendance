import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessibleClasses, useMyRoles } from "@/features/shared/roles";
import { prettyDate, todayISO } from "@/features/shared/date";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2, CalendarDays, Globe } from "lucide-react";
import { qk } from "@/features/shared/queryKeys";
import { useCopyShare } from "@/features/shared/useCopyShare";
import { ReportActions, RawTextDetails } from "@/components/shared/ReportActions";
import { StatTiles } from "@/components/shared/StatTiles";
import { RosterIdentity } from "@/components/shared/RosterIdentity";
import { ClassSelect } from "@/components/shared/ClassSelect";

const searchSchema = z.object({ classId: z.string().optional(), date: z.string().optional() });
export const Route = createFileRoute("/_authenticated/app/absentees")({
  head: () => ({ meta: [{ title: "Absentees — Smart Attend Hub" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AbsenteesPage,
});

type Scope = "class" | "dept" | "year" | "all";

function AbsenteesPage() {
  const sp = Route.useSearch();
  const { data: roles } = useMyRoles();
  const { data: classes } = useMyAccessibleClasses();
  const [date, setDate] = useState(sp.date ?? todayISO());
  const [scope, setScope] = useState<Scope>("class");
  const [classId, setClassId] = useState<string | null>(sp.classId || null);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [yearId, setYearId] = useState<string | null>(null);

  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const isPrincipal = roles?.some((r) => r.role === "principal");
  const isHodOrAbove = isPrincipal || roles?.some((r) => r.role === "hod");

  const depts = useMemo(() => {
    const m = new Map<string, string>();
    (classes ?? []).forEach((c) => m.set(c.dept_id, c.dept_name));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [classes]);

  const years = useMemo(() => {
    const m = new Map<string, { id: string; label: string; dept_id: string; dept_name: string }>();
    (classes ?? []).forEach((c) =>
      m.set(c.year_id, {
        id: c.year_id,
        label: c.year_label,
        dept_id: c.dept_id,
        dept_name: c.dept_name,
      }),
    );
    return Array.from(m.values());
  }, [classes]);

  const targetClassIds = useMemo(() => {
    if (!classes) return [];
    if (scope === "all") return classes.map((c) => c.id);
    if (scope === "dept") return classes.filter((c) => c.dept_id === deptId).map((c) => c.id);
    if (scope === "year") return classes.filter((c) => c.year_id === yearId).map((c) => c.id);
    return classId ? [classId] : [];
  }, [scope, classes, classId, deptId, yearId]);

  const { data: report } = useQuery({
    enabled: targetClassIds.length > 0,
    queryKey: qk.attendanceForClasses(targetClassIds, date),
    queryFn: async () => {
      const [studentsRes, attRes, classesRes, yearsRes, deptsRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, name, roll_no, class_id")
          .in("class_id", targetClassIds),
        supabase
          .from("attendance")
          .select("student_id, status, class_id")
          .in("class_id", targetClassIds)
          .eq("date", date)
          .eq("status", "absent"),
        supabase.from("classes").select("id, name, year_id").in("id", targetClassIds),
        supabase.from("years").select("id, label, dept_id"),
        supabase.from("departments").select("id, name"),
      ]);
      if (studentsRes.error) throw studentsRes.error;
      if (attRes.error) throw attRes.error;

      const absentIds = new Set((attRes.data ?? []).map((a) => a.student_id));
      const yearMap = Object.fromEntries((yearsRes.data ?? []).map((y) => [y.id, y]));
      const deptMap = Object.fromEntries((deptsRes.data ?? []).map((d) => [d.id, d.name]));
      const classMap = Object.fromEntries((classesRes.data ?? []).map((c) => [c.id, c]));

      const byClass = new Map<
        string,
        {
          className: string;
          deptName: string;
          yearLabel: string;
          students: { name: string; roll_no: string }[];
        }
      >();
      (studentsRes.data ?? []).forEach((s) => {
        if (!absentIds.has(s.id)) return;
        const cl = classMap[s.class_id as string];
        const yr = cl ? yearMap[cl.year_id] : undefined;
        const key = s.class_id as string;
        if (!byClass.has(key)) {
          byClass.set(key, {
            className: cl?.name ?? "",
            deptName: yr ? (deptMap[yr.dept_id] ?? "") : "",
            yearLabel: yr?.label ?? "",
            students: [],
          });
        }
        byClass.get(key)!.students.push({ name: s.name, roll_no: s.roll_no });
      });
      byClass.forEach((g) => g.students.sort((a, b) => a.roll_no.localeCompare(b.roll_no)));
      return {
        groups: Array.from(byClass.values()),
        totalStudents: studentsRes.data?.length ?? 0,
      };
    },
  });

  const totalStudents = report?.totalStudents ?? 0;
  const totalAbsent = report?.groups.reduce((a, g) => a + g.students.length, 0) ?? 0;
  const totalPresent = totalStudents - totalAbsent;

  const text = useMemo(() => {
    if (!report) return "";
    const lines: string[] = [];
    lines.push(`📋 Absentees — ${prettyDate(date)}`);
    lines.push(`Total: ${totalStudents} · Present: ${totalPresent} · Absent: ${totalAbsent}`);
    lines.push("");
    report.groups.forEach((g) => {
      lines.push(`${g.deptName} · ${g.yearLabel} · ${g.className} (${g.students.length} absent)`);
      g.students.forEach((s) => lines.push(`  ${s.roll_no}  ${s.name}`));
      lines.push("");
    });
    if (report.groups.length === 0) lines.push("No absentees today. 🎉");
    else lines.push(`Total absent: ${totalAbsent}`);
    return lines.join("\n");
  }, [report, date, totalStudents, totalPresent, totalAbsent]);

  const { copy, share } = useCopyShare(text, `Absentees — ${prettyDate(date)}`);

  const scopeOptions: { key: Scope; label: string; icon: React.ElementType; show: boolean }[] = [
    { key: "class", label: "Class", icon: Users, show: true },
    { key: "year", label: "Year", icon: CalendarDays, show: true },
    { key: "dept", label: "Dept", icon: Building2, show: !!isHodOrAbove },
    { key: "all", label: "All", icon: Globe, show: !!isPrincipal },
  ];

  return (
    <div className="space-y-5 animate-slide-up">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
          <Users className="h-4 w-4 text-primary-foreground" />
        </span>
        Absentees
      </h1>

      {/* Filters card */}
      <div className="rounded-2xl border bg-card p-4 space-y-4 shadow-sm">
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
        </div>

        {/* Scope */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Scope
          </label>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {scopeOptions
              .filter((o) => o.show)
              .map((o) => (
                <button
                  key={o.key}
                  onClick={() => setScope(o.key)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2.5 border text-xs font-medium transition-all btn-press ${
                    scope === o.key
                      ? "gradient-primary text-primary-foreground border-transparent shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <o.icon className="h-4 w-4" />
                  {o.label}
                </button>
              ))}
          </div>
        </div>

        {/* Scoped selects */}
        {scope === "class" && (
          <ClassSelect
            classes={classes}
            value={classId}
            onChange={setClassId}
            className="w-full bg-background shadow-none"
          />
        )}
        {scope === "year" && (
          <select
            value={yearId ?? ""}
            onChange={(e) => setYearId(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
          >
            <option value="">Select year…</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.dept_name} · {y.label}
              </option>
            ))}
          </select>
        )}
        {scope === "dept" && (
          <select
            value={deptId ?? ""}
            onChange={(e) => setDeptId(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
          >
            <option value="">Select department…</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Report */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl display">
            Report ·{" "}
            <span className={totalAbsent > 0 ? "text-destructive" : "text-success"}>
              {totalAbsent} absent
            </span>
          </h2>
          <ReportActions onCopy={copy} onShare={share} />
        </div>

        {/* Total / Present / Absent summary */}
        {report && (
          <StatTiles
            className="mb-4"
            tiles={[
              { label: "Total", value: totalStudents, tone: "text-foreground" },
              { label: "Present", value: totalPresent, tone: "text-success" },
              { label: "Absent", value: totalAbsent, tone: "text-destructive" },
            ]}
          />
        )}

        {/* Rendered report cards */}
        {report && report.groups.length > 0 ? (
          <div className="space-y-3 stagger-children">
            {report.groups.map((g, i) => (
              <div
                key={i}
                className="rounded-2xl border bg-card p-4 shadow-sm animate-slide-up card-hover"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-sm">
                      {g.deptName} · {g.yearLabel} · {g.className}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-destructive bg-destructive/10 rounded-full px-2.5 py-1">
                    {g.students.length} absent
                  </span>
                </div>
                <ul className="divide-y">
                  {g.students.map((s) => (
                    <li key={s.roll_no} className="py-2 text-sm">
                      <RosterIdentity rollNo={s.roll_no} name={s.name} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : report && report.groups.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center animate-slide-up">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-sm text-muted-foreground">No absentees today!</p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Select a scope above to load report.
          </div>
        )}

        {/* Raw text (collapsible) */}
        <RawTextDetails text={text} />
      </div>
    </div>
  );
}
