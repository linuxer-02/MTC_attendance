import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Building2, CalendarDays, BookOpen } from "lucide-react";

export function StructureTab({ isPrincipal }: { isPrincipal: boolean }) {
  const qc = useQueryClient();

  const { data: depts } = useQuery({
    queryKey: ["all-depts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: years } = useQuery({
    queryKey: ["all-years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("years").select("*").order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: classes } = useQuery({
    queryKey: ["all-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [newDept, setNewDept] = useState("");
  const [yearDept, setYearDept] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [classYear, setClassYear] = useState("");
  const [className, setClassName] = useState("");

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["all-depts"] });
    qc.invalidateQueries({ queryKey: ["all-years"] });
    qc.invalidateQueries({ queryKey: ["all-classes"] });
    qc.invalidateQueries({ queryKey: ["my-classes"] });
  };

  const addDept = async () => {
    if (!newDept.trim()) return;
    const { error } = await supabase.from("departments").insert({ name: newDept.trim() });
    if (error) return toast.error(error.message);
    setNewDept("");
    invalidateAll();
    toast.success("Department added");
  };

  const addYear = async () => {
    if (!yearDept || !yearLabel.trim()) return;
    const { error } = await supabase
      .from("years")
      .insert({ dept_id: yearDept, label: yearLabel.trim() });
    if (error) return toast.error(error.message);
    setYearLabel("");
    invalidateAll();
    toast.success("Year added");
  };

  const addClass = async () => {
    if (!classYear || !className.trim()) return;
    const { error } = await supabase
      .from("classes")
      .insert({ year_id: classYear, name: className.trim() });
    if (error) return toast.error(error.message);
    setClassName("");
    invalidateAll();
    toast.success("Class added");
  };

  const del = async (table: "departments" | "years" | "classes", id: string) => {
    if (!confirm("Delete? This also removes all child records.")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    invalidateAll();
    toast.success("Deleted");
  };

  return (
    <div className="space-y-4">
      {/* Departments — Principal only */}
      {isPrincipal && (
        <Section title="Departments" icon={Building2}>
          <div className="flex gap-2">
            <input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDept()}
              placeholder="e.g. Computer Science"
              className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm"
            />
            <button
              onClick={addDept}
              className="flex items-center gap-1.5 rounded-xl gradient-primary text-primary-foreground px-4 text-sm btn-press"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          <ul className="mt-3 divide-y rounded-xl border bg-background overflow-hidden">
            {depts?.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground text-center">No departments yet.</li>
            )}
            {depts?.map((d) => (
              <li key={d.id} className="flex justify-between items-center px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{d.name}</span>
                </div>
                <button
                  onClick={() => del("departments", d.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Years */}
      <Section title="Years" icon={CalendarDays}>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={yearDept}
            onChange={(e) => setYearDept(e.target.value)}
            className="col-span-2 rounded-xl border bg-background px-2 py-2.5 text-sm"
          >
            <option value="">Department…</option>
            {depts?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            value={yearLabel}
            onChange={(e) => setYearLabel(e.target.value)}
            placeholder="e.g. 2nd Year"
            className="rounded-xl border bg-background px-2 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={addYear}
          className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl gradient-primary text-primary-foreground py-2.5 text-sm btn-press"
        >
          <Plus className="h-4 w-4" />
          Add Year
        </button>
        <ul className="mt-3 divide-y rounded-xl border bg-background overflow-hidden">
          {years?.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground text-center">No years yet.</li>
          )}
          {years?.map((y) => {
            const d = depts?.find((x) => x.id === y.dept_id);
            return (
              <li key={y.id} className="flex justify-between items-center px-4 py-3 text-sm">
                <span>
                  <span className="text-muted-foreground">{d?.name} · </span>
                  <span className="font-medium">{y.label}</span>
                </span>
                <button
                  onClick={() => del("years", y.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Classes */}
      <Section title="Classes" icon={BookOpen}>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={classYear}
            onChange={(e) => setClassYear(e.target.value)}
            className="col-span-2 rounded-xl border bg-background px-2 py-2.5 text-sm"
          >
            <option value="">Year…</option>
            {years?.map((y) => {
              const d = depts?.find((x) => x.id === y.dept_id);
              return (
                <option key={y.id} value={y.id}>
                  {d?.name} · {y.label}
                </option>
              );
            })}
          </select>
          <input
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="e.g. Section A"
            className="rounded-xl border bg-background px-2 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={addClass}
          className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl gradient-primary text-primary-foreground py-2.5 text-sm btn-press"
        >
          <Plus className="h-4 w-4" />
          Add Class
        </button>
        <ul className="mt-3 divide-y rounded-xl border bg-background overflow-hidden">
          {classes?.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground text-center">No classes yet.</li>
          )}
          {classes?.map((c) => {
            const y = years?.find((x) => x.id === c.year_id);
            const d = y ? depts?.find((x) => x.id === y.dept_id) : null;
            return (
              <li key={c.id} className="flex justify-between items-center px-4 py-3 text-sm">
                <span>
                  <span className="text-muted-foreground">
                    {d?.name} · {y?.label} ·{" "}
                  </span>
                  <span className="font-medium">{c.name}</span>
                </span>
                <button
                  onClick={() => del("classes", c.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="text-xl display mb-3 flex items-center gap-2">
        <Icon className="h-4.5 w-4.5 text-primary" />
        {title}
      </h3>
      {children}
    </div>
  );
}
