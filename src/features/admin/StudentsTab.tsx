import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import Papa from "papaparse";
import { Trash2, UserPlus, FileUp, Users, Plus } from "lucide-react";

export function StudentsTab() {
  const qc = useQueryClient();
  const { data: classes } = useQuery({
    queryKey: ["all-classes-simple"],
    queryFn: async () =>
      (
        await supabase
          .from("classes")
          .select("id, name, year_id, years(label, departments(name))")
          .order("name")
      ).data ?? [],
  });
  const [classId, setClassId] = useState("");
  const { data: students, refetch } = useQuery({
    enabled: !!classId,
    queryKey: ["students-admin", classId],
    queryFn: async () =>
      (await supabase.from("students").select("*").eq("class_id", classId).order("roll_no")).data ??
      [],
  });

  const [rollNo, setRollNo] = useState("");
  const [name, setName] = useState("");
  const [csvText, setCsvText] = useState("");

  const addOne = async () => {
    if (!classId) return toast.error("Select a class first");
    if (!rollNo.trim() || !name.trim()) return toast.error("Roll number and name are required");
    
    const { error } = await supabase
      .from("students")
      .insert({ class_id: classId, roll_no: rollNo.trim(), name: name.trim() });
      
    if (error) {
      if (error.code === "23505") {
        return toast.error("A student with this roll number already exists in this class");
      }
      return toast.error(error.message);
    }
    
    setRollNo("");
    setName("");
    refetch();
    qc.invalidateQueries({ queryKey: ["students", classId] });
    toast.success("Student added");
  };

  const uploadCsv = async () => {
    if (!classId) return toast.error("Pick a class first");
    const parsed = Papa.parse<{ roll_no?: string; name?: string; roll?: string }>(csvText.trim(), {
      header: true,
      skipEmptyLines: true,
    });
    const rows = parsed.data
      .map((r) => ({
        roll_no: (r.roll_no ?? r.roll ?? "").toString().trim(),
        name: (r.name ?? "").toString().trim(),
      }))
      .filter((r) => r.roll_no && r.name)
      .map((r) => ({ ...r, class_id: classId }));
    if (rows.length === 0) return toast.error("No valid rows. Expect columns: roll_no, name");
    const { error } = await supabase
      .from("students")
      .upsert(rows, { onConflict: "class_id,roll_no" });
    if (error) return toast.error(error.message);
    toast.success(`Uploaded ${rows.length} students`);
    setCsvText("");
    refetch();
    qc.invalidateQueries({ queryKey: ["students", classId] });
  };

  const del = async (id: string) => {
    if (!confirm("Remove student?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed student");
    refetch();
    qc.invalidateQueries({ queryKey: ["students", classId] });
  };

  return (
    <div className="space-y-4">
      <select
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
        className="w-full rounded-xl border bg-card px-3 py-2.5 text-sm shadow-sm"
      >
        <option value="">Select a class…</option>
        {classes?.map((c: any) => (
          <option key={c.id} value={c.id}>
            {c.years?.departments?.name} · {c.years?.label} · {c.name}
          </option>
        ))}
      </select>

      {classId && (
        <div className="animate-slide-up space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Add single student */}
            <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
              <h3 className="text-xl display flex items-center gap-2">
                <UserPlus className="h-4.5 w-4.5 text-primary" />
                Add Student
              </h3>
              <div className="flex gap-2">
                <input
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  placeholder="Roll no"
                  className="w-20 rounded-xl border bg-background px-3 py-2.5 text-sm font-mono"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm"
                />
              </div>
              <button
                onClick={addOne}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl gradient-primary text-primary-foreground py-2.5 text-sm font-medium shadow-sm btn-press"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            {/* Bulk upload */}
            <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
              <h3 className="text-xl display flex items-center gap-2">
                <FileUp className="h-4.5 w-4.5 text-accent" />
                Bulk Upload (CSV)
              </h3>
              <p className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-lg">
                Paste CSV data with headers <code>roll_no,name</code>. Existing roll numbers will be
                updated.
              </p>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={3}
                placeholder="roll_no,name&#10;01,Alice&#10;02,Bob"
                className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono resize-none focus:h-32 transition-all"
              />
              <button
                onClick={uploadCsv}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent/5 text-accent py-2.5 text-sm font-medium hover:bg-accent/10 transition-colors btn-press"
              >
                <FileUp className="h-4 w-4" />
                Upload Data
              </button>
            </div>
          </div>

          {/* Roster list */}
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="text-xl display mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-primary" />
                Class Roster
              </span>
              <span className="text-sm font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                {students?.length ?? 0}
              </span>
            </h3>

            <ul className="divide-y rounded-xl border bg-background overflow-hidden">
              {students?.length === 0 && (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No students added yet.
                </li>
              )}
              {students?.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground w-8">{s.roll_no}</span>
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <button
                    onClick={() => del(s.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
