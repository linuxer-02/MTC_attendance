import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Shield, Plus, Building2, BookOpen } from "lucide-react";

type AppRole = "principal" | "hod" | "incharge";

export function StaffTab({ isPrincipal }: { isPrincipal: boolean }) {
  const qc = useQueryClient();

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("email");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: allRoles } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: depts } = useQuery({
    queryKey: ["all-depts"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["all-classes"],
    queryFn: async () =>
      (
        await supabase
          .from("classes")
          .select("id, name, year_id, years(label, departments(name))")
          .order("name")
      ).data ?? [],
  });

  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AppRole>("incharge");
  const [deptId, setDeptId] = useState("");
  const [classId, setClassId] = useState("");

  const assign = async () => {
    if (!userId) return toast.error("Pick a staff member");
    const payload: any = { user_id: userId, role };
    if (role === "hod") payload.dept_id = deptId || null;
    if (role === "incharge") payload.class_id = classId || null;
    const { error } = await supabase.from("user_roles").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Role assigned ✓");
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  };

  const removeRole = async (id: string) => {
    if (!confirm("Remove this role?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["all-roles"] });
    toast.success("Role removed");
  };

  const emailOf = (uid: string) => profiles?.find((p) => p.id === uid)?.email ?? uid.slice(0, 8);
  const nameOf = (uid: string) => profiles?.find((p) => p.id === uid)?.full_name;

  return (
    <div className="space-y-4">
      {/* Assign Role Card */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
        <h3 className="text-xl display flex items-center gap-2">
          <Shield className="h-4.5 w-4.5 text-primary" />
          Assign Role
        </h3>

        <div className="space-y-3">
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
          >
            <option value="">Select staff member…</option>
            {profiles?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.email} {p.full_name ? `· ${p.full_name}` : ""}
              </option>
            ))}
          </select>

          <div className="flex gap-1.5 rounded-xl border bg-background p-1.5 text-sm">
            {(isPrincipal ? (["hod", "incharge"] as AppRole[]) : (["incharge"] as AppRole[])).map(
              (r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg py-2 capitalize transition-colors ${
                    role === r
                      ? "bg-primary text-primary-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r === "hod" ? "HOD" : r}
                </button>
              ),
            )}
          </div>

          {role === "hod" && (
            <div className="animate-slide-up">
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Department…</option>
                {depts?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {role === "incharge" && (
            <div className="animate-slide-up">
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Class…</option>
                {classes?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.years?.departments?.name} · {c.years?.label} · {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={assign}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl gradient-primary text-primary-foreground py-2.5 text-sm font-medium shadow-sm btn-press"
          >
            <Plus className="h-4 w-4" />
            Assign Role
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-2 bg-muted/40 p-2.5 rounded-xl">
          Staff must sign up first. Their email appears here once they've created an account.
        </p>
      </div>

      {/* Current Roles List */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="text-xl display mb-3">Current Roles</h3>
        <ul className="divide-y rounded-xl border bg-background overflow-hidden">
          {allRoles
            ?.filter((r) => isPrincipal || r.role !== "principal")
            .map((r: any) => {
              const cls: any = classes?.find((c: any) => c.id === r.class_id);
              const dept = depts?.find((d) => d.id === r.dept_id);
              const fname = nameOf(r.user_id);
              return (
                <li key={r.id} className="flex items-center justify-between p-3 text-sm gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{fname || emailOf(r.user_id)}</div>
                    {fname && (
                      <div className="text-xs text-muted-foreground truncate">
                        {emailOf(r.user_id)}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ${
                          r.role === "principal"
                            ? "bg-accent/15 text-accent"
                            : r.role === "hod"
                              ? "bg-primary/15 text-primary"
                              : "bg-success/15 text-success"
                        }`}
                      >
                        {r.role}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {dept && (
                          <>
                            <Building2 className="h-3 w-3" /> {dept.name}
                          </>
                        )}
                        {cls && (
                          <>
                            <BookOpen className="h-3 w-3" /> {cls.years?.departments?.name} ·{" "}
                            {cls.years?.label} · {cls.name}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  {(isPrincipal || r.role === "incharge") && (
                    <button
                      onClick={() => removeRole(r.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
