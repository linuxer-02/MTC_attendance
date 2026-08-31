import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/features/shared/roles";
import { useMutation } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday } from "date-fns";
import { toast } from "sonner";
import { FileSpreadsheet, Save, Eye, Pencil } from "lucide-react";
import { AccessDenied, AccessCheckSkeleton } from "@/components/shared/AccessDenied";
import {
  STAFF_STATUS_META,
  STAFF_ATTENDED_STATUSES,
  staffStatusMeta,
  useStaffMembers,
  useStaffAttendance,
  useStaffAttendanceInvalidator,
  type StaffStatus,
} from "@/features/staff/staffStatus";

export const Route = createFileRoute("/_authenticated/app/staff/register")({
  head: () => ({ meta: [{ title: "Staff Register — Smart Attend Hub" }] }),
  component: StaffRegisterPage,
});

type CellStatus = StaffStatus | "unmarked";

function StaffRegisterPage() {
  const { data: roles, isLoading: isLoadingRoles } = useMyRoles();
  const canAccess = roles?.some((r) => r.role === "principal" || r.role === "admin");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [editMode, setEditMode] = useState(false);
  const invalidateStaffAttendance = useStaffAttendanceInvalidator();

  const monthStart = useMemo(() => startOfMonth(new Date(selectedMonth + "-01")), [selectedMonth]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);
  const monthFromStr = format(monthStart, "yyyy-MM-dd");
  const monthToStr = format(monthEnd, "yyyy-MM-dd");

  const daysInMonth = useMemo(
    () =>
      eachDayOfInterval({ start: monthStart, end: monthEnd }).map((d, i) => ({
        date: format(d, "yyyy-MM-dd"),
        dayNum: i + 1,
        isSunday: isSunday(d),
      })),
    [monthStart, monthEnd],
  );

  const { data: staff } = useStaffMembers();
  const { data: rangeRows } = useStaffAttendance(monthFromStr, monthToStr);

  const serverCellMap = useMemo(() => {
    const m = new Map<string, StaffStatus>();
    (rangeRows ?? []).forEach((r) => m.set(`${r.staff_id}|${r.date}`, r.status as StaffStatus));
    return m;
  }, [rangeRows]);

  // Uncommitted local edits: `${staff_id}|${date}` -> status (Excel-grid style,
  // same interaction pattern as the student Entries page).
  const [gridEdits, setGridEdits] = useState<Map<string, CellStatus>>(new Map());
  useEffect(() => {
    setGridEdits(new Map());
  }, [selectedMonth]);

  const currentMatrixMap = useMemo(() => {
    const combined = new Map<string, CellStatus>(serverCellMap);
    gridEdits.forEach((val, key) => combined.set(key, val));
    return combined;
  }, [serverCellMap, gridEdits]);

  const unsavedCount = gridEdits.size;

  const setCell = (staffId: string, date: string, next: CellStatus) => {
    const key = `${staffId}|${date}`;
    setGridEdits((prev) => {
      const map = new Map(prev);
      const original = serverCellMap.get(key) ?? "unmarked";
      if (next === original) map.delete(key);
      else map.set(key, next);
      return map;
    });
  };

  // Quick column batch edit — mark every staff member present for a day, same
  // interaction pattern as the student Entries page's per-column P button.
  const setColumnPresent = (dateStr: string) => {
    if (!staff || staff.length === 0) return;
    setGridEdits((prev) => {
      const next = new Map(prev);
      staff.forEach((s) => {
        const key = `${s.id}|${dateStr}`;
        const original = serverCellMap.get(key) ?? "unmarked";
        if (original === "present") next.delete(key);
        else next.set(key, "present");
      });
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (gridEdits.size === 0) return;
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      const upserts: { staff_id: string; date: string; status: StaffStatus; marked_by?: string }[] =
        [];
      const deletes: { staff_id: string; date: string }[] = [];
      gridEdits.forEach((status, key) => {
        const [staff_id, date] = key.split("|");
        if (status === "unmarked") {
          deletes.push({ staff_id, date });
        } else {
          upserts.push({ staff_id, date, status, ...(uid ? { marked_by: uid } : {}) });
        }
      });
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("staff_attendance")
          .upsert(upserts, { onConflict: "staff_id,date" });
        if (error) throw error;
      }
      for (const d of deletes) {
        const { error } = await supabase
          .from("staff_attendance")
          .delete()
          .eq("staff_id", d.staff_id)
          .eq("date", d.date);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Register changes saved");
      setGridEdits(new Map());
      invalidateStaffAttendance();
    },
    onError: (err: Error) => toast.error("Failed to save: " + err.message),
  });

  if (isLoadingRoles) {
    return <AccessCheckSkeleton />;
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-5 animate-slide-up pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl display flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shadow-sm">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          Staff Register
        </h1>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="rounded-xl border bg-card px-3.5 py-2.5 text-sm font-medium shadow-sm"
        />
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-xl bg-muted p-1 border gap-1">
            <button
              onClick={() => setEditMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !editMode
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </button>
            <button
              onClick={() => setEditMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                editMode
                  ? "gradient-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
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
        <button
          onClick={() => saveMutation.mutate()}
          disabled={unsavedCount === 0 || saveMutation.isPending}
          className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all btn-press ${
            unsavedCount > 0
              ? "gradient-primary text-primary-foreground"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          <Save className="h-3.5 w-3.5" />
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="bg-muted/80 border-b text-muted-foreground font-semibold">
                <th className="sticky left-0 z-20 bg-muted/95 px-3 py-3 text-left w-36 border-r text-[11px] uppercase tracking-wide whitespace-nowrap shadow-[2px_0_8px_-2px_rgba(0,0,0,0.12)]">
                  Staff
                </th>
                {daysInMonth.map((d) => (
                  <th
                    key={d.date}
                    className={`p-1.5 text-center min-w-[32px] border-r align-top ${
                      d.isSunday ? "bg-muted/50 text-muted-foreground/50" : ""
                    }`}
                  >
                    <div>{d.dayNum}</div>
                    {editMode && !d.isSunday && (
                      <button
                        onClick={() => setColumnPresent(d.date)}
                        title="Mark all Present"
                        className="mt-1 text-[9px] w-5 h-4 rounded bg-success/20 text-success hover:bg-success/40 font-bold transition-colors"
                      >
                        P
                      </button>
                    )}
                  </th>
                ))}
                {STAFF_STATUS_META.map((m) => (
                  <th key={m.value} className="p-2 text-center border-r min-w-[36px]">
                    {m.code}
                  </th>
                ))}
                <th className="sticky right-0 z-20 bg-muted/95 px-2 py-3 text-center min-w-[56px] border-l shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.12)]">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff?.map((s) => {
                const counts: Record<StaffStatus, number> = {
                  present: 0,
                  absent: 0,
                  on_duty: 0,
                  medical_leave: 0,
                  casual_leave: 0,
                  half_day_leave: 0,
                  late_arrival: 0,
                };
                daysInMonth.forEach((d) => {
                  const st = currentMatrixMap.get(`${s.id}|${d.date}`);
                  if (st && st !== "unmarked") counts[st]++;
                });
                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                const attended = STAFF_ATTENDED_STATUSES.reduce((a, k) => a + counts[k], 0);
                const pct = total > 0 ? Math.round((attended / total) * 100) : 0;

                return (
                  <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 border-r max-w-36 truncate shadow-[2px_0_8px_-2px_rgba(0,0,0,0.12)] whitespace-nowrap">
                      <div className="font-medium">{s.name}</div>
                      {s.department && (
                        <div className="text-[10px] text-muted-foreground">{s.department}</div>
                      )}
                    </td>
                    {daysInMonth.map((d) => {
                      const key = `${s.id}|${d.date}`;
                      const st = currentMatrixMap.get(key);
                      const isEdited = gridEdits.has(key);
                      return (
                        <td
                          key={d.date}
                          className={`p-1 text-center border-r transition-all ${
                            d.isSunday ? "bg-muted/20" : ""
                          } ${isEdited ? "ring-2 ring-primary ring-inset" : ""}`}
                        >
                          {d.isSunday ? (
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground/40 text-[10px]"
                              title="Sunday — off"
                            >
                              S
                            </span>
                          ) : editMode ? (
                            <select
                              value={st && st !== "unmarked" ? st : ""}
                              onChange={(e) =>
                                setCell(s.id, d.date, (e.target.value || "unmarked") as CellStatus)
                              }
                              className={`w-11 rounded-md text-center text-[10px] font-bold border-0 py-1 cursor-pointer ${
                                st && st !== "unmarked"
                                  ? staffStatusMeta(st).cellClass
                                  : "bg-muted/60 text-muted-foreground/60"
                              }`}
                            >
                              <option value="">–</option>
                              {STAFF_STATUS_META.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.code}
                                </option>
                              ))}
                            </select>
                          ) : st && st !== "unmarked" ? (
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold ${staffStatusMeta(st).cellClass}`}
                            >
                              {staffStatusMeta(st).code}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-muted/60 text-muted-foreground/40 text-[10px]">
                              –
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {STAFF_STATUS_META.map((m) => (
                      <td key={m.value} className="p-2 text-center border-r text-muted-foreground">
                        {counts[m.value] || ""}
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 bg-card border-l px-2 py-2 text-center shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.12)]">
                      <span
                        className={`text-xs font-bold ${total === 0 ? "text-muted-foreground" : pct >= 75 ? "text-success" : "text-destructive"}`}
                      >
                        {total > 0 ? `${pct}%` : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {staff?.length === 0 && (
                <tr>
                  <td
                    colSpan={daysInMonth.length + STAFF_STATUS_META.length + 2}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No staff added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 bg-muted/30 border-t text-[11px] text-muted-foreground">
          {editMode
            ? "💡 Pick a status from each cell's dropdown (P/A/OD/ML/CL/HL/LA/–), then Save Changes."
            : "💡 Switch to Edit mode to change cells directly in the grid."}
        </p>
      </div>
    </div>
  );
}
