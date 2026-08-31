import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/features/shared/roles";
import { prettyDate, todayISO } from "@/features/shared/date";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { AccessDenied, AccessCheckSkeleton } from "@/components/shared/AccessDenied";
import { ReportActions, RawTextDetails } from "@/components/shared/ReportActions";
import { useCopyShare } from "@/features/shared/useCopyShare";
import { STAFF_STATUS_META } from "@/features/staff/staffStatus";
import type { StaffStatus } from "@/features/staff/staffStatus";

const searchSchema = z.object({ date: z.string().optional() });
export const Route = createFileRoute("/_authenticated/app/staff/report")({
  head: () => ({ meta: [{ title: "Staff Report — Smart Attend Hub" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: StaffReportPage,
});

// Everyone except "present" is worth surfacing in the daily report — derived
// from the central STAFF_STATUS_META so a new status only needs adding once.
const REPORTABLE = STAFF_STATUS_META.filter((m) => m.value !== "present").map((m) => ({
  value: m.value,
  label: m.label,
}));

function StaffReportPage() {
  const sp = Route.useSearch();
  const { data: roles, isLoading: isLoadingRoles } = useMyRoles();
  const canAccess = roles?.some((r) => r.role === "principal" || r.role === "admin");
  const [date, setDate] = useState(sp.date ?? todayISO());

  const { data: report } = useQuery({
    enabled: !!canAccess,
    queryKey: ["staff-report", date],
    queryFn: async () => {
      const [staffRes, attRes] = await Promise.all([
        supabase.from("staff_members").select("id, name"),
        supabase
          .from("staff_attendance")
          .select("staff_id, status")
          .eq("date", date)
          .neq("status", "present"),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (attRes.error) throw attRes.error;

      const nameOf = Object.fromEntries((staffRes.data ?? []).map((s) => [s.id, s.name]));
      const byStatus = new Map<StaffStatus, string[]>();
      (attRes.data ?? []).forEach((a) => {
        const status = a.status as StaffStatus;
        if (!byStatus.has(status)) byStatus.set(status, []);
        byStatus.get(status)!.push(nameOf[a.staff_id] ?? a.staff_id);
      });
      byStatus.forEach((names) => names.sort());
      return byStatus;
    },
  });

  const totalFlagged = useMemo(
    () => (report ? Array.from(report.values()).reduce((a, names) => a + names.length, 0) : 0),
    [report],
  );

  const text = useMemo(() => {
    if (!report) return "";
    const lines: string[] = [`📋 Staff Report — ${prettyDate(date)}`, ""];
    REPORTABLE.forEach((r) => {
      const names = report.get(r.value);
      if (!names || names.length === 0) return;
      lines.push(`${r.label} (${names.length})`);
      names.forEach((n) => lines.push(`  ${n}`));
      lines.push("");
    });
    if (totalFlagged === 0) lines.push("Everyone present today. 🎉");
    return lines.join("\n");
  }, [report, date, totalFlagged]);

  const { copy, share } = useCopyShare(text, `Staff Report — ${prettyDate(date)}`);

  if (isLoadingRoles) return <AccessCheckSkeleton />;
  if (!canAccess) return <AccessDenied />;

  return (
    <div className="space-y-5 animate-slide-up">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
          <Users className="h-4 w-4 text-primary-foreground" />
        </span>
        Staff Report
      </h1>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl display">
            Report ·{" "}
            <span className={totalFlagged > 0 ? "text-destructive" : "text-success"}>
              {totalFlagged} flagged
            </span>
          </h2>
          <ReportActions onCopy={copy} onShare={share} />
        </div>

        {totalFlagged > 0 ? (
          <div className="space-y-3 stagger-children">
            {REPORTABLE.filter((r) => (report?.get(r.value)?.length ?? 0) > 0).map((r) => {
              const names = report!.get(r.value)!;
              return (
                <div
                  key={r.value}
                  className="rounded-2xl border bg-card p-4 shadow-sm animate-slide-up card-hover"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-sm">{r.label}</div>
                    <span className="text-xs font-bold text-destructive bg-destructive/10 rounded-full px-2.5 py-1">
                      {names.length}
                    </span>
                  </div>
                  <ul className="divide-y">
                    {names.map((name) => (
                      <li key={name} className="py-2 text-sm truncate">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-8 text-center animate-slide-up">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-sm text-muted-foreground">Everyone present today!</p>
          </div>
        )}

        <RawTextDetails text={text} />
      </div>
    </div>
  );
}
