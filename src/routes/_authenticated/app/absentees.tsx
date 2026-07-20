import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessibleClasses, useMyRoles } from "@/features/shared/roles";
import { prettyDate, todayISO } from "@/features/shared/date";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Share2, Users, Building2, CalendarDays, Globe } from "lucide-react";

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
    queryKey: ["absentees", targetClassIds.join(","), date],
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
      return Array.from(byClass.values());
    },
  });

  const totalAbsent = report?.reduce((a, g) => a + g.students.length, 0) ?? 0;

  const text = useMemo(() => {
    if (!report) return "";
    const lines: string[] = [];
    lines.push(`📋 Absentees — ${prettyDate(date)}`);
    lines.push("");
    report.forEach((g) => {
      lines.push(`${g.deptName} · ${g.yearLabel} · ${g.className} (${g.students.length} absent)`);
      g.students.forEach((s) => lines.push(`  ${s.roll_no}  ${s.name}`));
      lines.push("");
    });
    if (report.length === 0) lines.push("No absentees today. 🎉");
    else lines.push(`Total absent: ${totalAbsent}`);
    return lines.join("\n");
  }, [report, date, totalAbsent]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const share = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: `Absentees — ${prettyDate(date)}`, text });
      toast.success("Shared successfully");
    } catch (err: any) {
      if (err.name !== "AbortError") toast.error("Share failed");
    }
  };

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
          <select
            value={classId ?? ""}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
          >
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.dept_name} · {c.year_label} · {c.name}
              </option>
            ))}
          </select>
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
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 text-sm rounded-xl border bg-card px-3 py-1.5 hover:bg-muted transition-colors btn-press"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
            <button
              onClick={share}
              className="flex items-center gap-1.5 text-sm rounded-xl gradient-primary text-primary-foreground px-3 py-1.5 shadow-sm btn-press"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          </div>
        </div>

        {/* Rendered report cards */}
        {report && report.length > 0 ? (
          <div className="space-y-3 stagger-children">
            {report.map((g, i) => (
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
                    <li key={s.roll_no} className="flex items-center gap-3 py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
                        {s.roll_no}
                      </span>
                      <span>{s.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : report && report.length === 0 ? (
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
        {text && (
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              View raw text (for copy)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs rounded-xl border bg-card p-4 font-mono overflow-x-auto">
              {text}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
