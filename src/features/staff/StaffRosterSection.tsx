import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Papa from "papaparse";
import { Trash2, UserPlus, Users, Pencil, Check, X, FileUp } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useStaffMembers, useStaffMembersInvalidator } from "@/features/staff/staffStatus";

type EditFields = { name: string; designation: string; department: string };

export function StaffRosterSection() {
  const invalidateStaff = useStaffMembersInvalidator();
  const { data: staff } = useStaffMembers();

  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditFields>({ name: "", designation: "", department: "" });
  const [csvText, setCsvText] = useState("");
  const [deletePending, setDeletePending] = useState<string | null>(null);

  const addOne = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Enter a staff name");
    if (trimmed.length > 100) return toast.error("Name must be 100 characters or less.");
    const { error } = await supabase.from("staff_members").insert({
      name: trimmed,
      designation: designation.trim() || null,
      department: department.trim() || null,
    });
    if (error) return toast.error(error.message);
    setName("");
    setDesignation("");
    setDepartment("");
    invalidateStaff();
    toast.success("Staff member added");
  };

  const uploadCsv = async () => {
    const parsed = Papa.parse<{ name?: string; designation?: string; department?: string }>(
      csvText.trim(),
      { header: true, skipEmptyLines: true },
    );
    const rows = parsed.data
      .map((r) => ({
        name: (r.name ?? "").toString().trim(),
        designation: (r.designation ?? "").toString().trim() || null,
        department: (r.department ?? "").toString().trim() || null,
      }))
      .filter((r) => r.name);
    if (rows.length === 0)
      return toast.error("No valid rows. Expect columns: name, designation, department");

    let added = 0;
    let updated = 0;
    for (const row of rows) {
      const { data: existing, error: selErr } = await supabase
        .from("staff_members")
        .select("id")
        .eq("name", row.name)
        .maybeSingle();
      if (selErr) return toast.error(selErr.message);
      if (existing) {
        const { error } = await supabase
          .from("staff_members")
          .update({ designation: row.designation, department: row.department })
          .eq("id", existing.id);
        if (error) return toast.error(error.message);
        updated++;
      } else {
        const { error } = await supabase.from("staff_members").insert(row);
        if (error) return toast.error(error.message);
        added++;
      }
    }
    toast.success(`Uploaded: ${added} added, ${updated} updated`);
    setCsvText("");
    invalidateStaff();
  };

  const startEdit = (id: string, current: EditFields) => {
    setEditingId(id);
    setEditing(current);
  };

  const saveEdit = async () => {
    const trimmed = editing.name.trim();
    if (!trimmed || !editingId) return toast.error("Name can't be empty");
    const { error } = await supabase
      .from("staff_members")
      .update({
        name: trimmed,
        designation: editing.designation.trim() || null,
        department: editing.department.trim() || null,
      })
      .eq("id", editingId);
    if (error) return toast.error(error.message);
    setEditingId(null);
    invalidateStaff();
    toast.success("Staff member updated");
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("staff_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    invalidateStaff();
    toast.success("Removed staff member");
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <h3 className="text-xl display flex items-center gap-2">
          <UserPlus className="h-4.5 w-4.5 text-primary" />
          Add Staff
        </h3>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addOne()}
          placeholder="Full name"
          className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOne()}
            placeholder="Designation (optional)"
            className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm"
          />
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOne()}
            placeholder="Department (optional)"
            className="flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={addOne}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-sm btn-press"
        >
          <UserPlus className="h-4 w-4" />
          Add
        </button>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
        <h3 className="text-xl display flex items-center gap-2">
          <FileUp className="h-4.5 w-4.5 text-accent" />
          Bulk Upload (CSV)
        </h3>
        <p className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-lg">
          Paste CSV data with headers <code>name,designation,department</code>. Existing names will
          be updated (designation/department only) rather than duplicated.
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={3}
          placeholder="name,designation,department&#10;Dr. Ushaa Eswaran,Principal,ECE"
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

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="text-xl display mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-4.5 w-4.5 text-primary" />
            Staff Roster
          </span>
          <span className="text-sm font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
            {staff?.length ?? 0}
          </span>
        </h3>

        <ul className="divide-y rounded-xl border bg-background overflow-hidden">
          {staff?.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
              No staff added yet.
            </li>
          )}
          {staff?.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors gap-2"
            >
              {editingId === s.id ? (
                <>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                      placeholder="Name"
                      className="w-full rounded-lg border bg-card px-2.5 py-1.5 text-sm"
                    />
                    <div className="flex gap-1.5">
                      <input
                        value={editing.designation}
                        onChange={(e) => setEditing((p) => ({ ...p, designation: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        placeholder="Designation"
                        className="flex-1 rounded-lg border bg-card px-2.5 py-1.5 text-xs"
                      />
                      <input
                        value={editing.department}
                        onChange={(e) => setEditing((p) => ({ ...p, department: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        placeholder="Department"
                        className="flex-1 rounded-lg border bg-card px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    onClick={saveEdit}
                    className="p-1.5 rounded-lg text-success hover:bg-success/10 transition-colors shrink-0"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    {(s.designation || s.department) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {[s.designation, s.department].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      startEdit(s.id, {
                        name: s.name,
                        designation: s.designation ?? "",
                        department: s.department ?? "",
                      })
                    }
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeletePending(s.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={!!deletePending}
        onOpenChange={(open) => !open && setDeletePending(null)}
        title="Remove staff member?"
        description="Their attendance history will be permanently deleted too. This cannot be undone."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (deletePending) del(deletePending);
          setDeletePending(null);
        }}
      />
    </div>
  );
}
