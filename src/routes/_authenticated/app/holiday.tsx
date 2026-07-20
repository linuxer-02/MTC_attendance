import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useMyAccessibleClasses } from "@/features/shared/roles";
import { todayISO, prettyDate, isSundayISO } from "@/features/shared/date";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Palmtree, CalendarCheck2 } from "lucide-react";

const searchSchema = z.object({ classId: z.string().optional() });
export const Route = createFileRoute("/_authenticated/app/holiday")({
  head: () => ({ meta: [{ title: "Mark Holiday — Smart Attend Hub" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: HolidayPage,
});

function HolidayPage() {
  const sp = Route.useSearch();
  const { data: classes } = useMyAccessibleClasses();
  const [classId, setClassId] = useState<string | null>(sp.classId || null);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!classId && classes?.[0]) setClassId(classes[0].id);
  }, [classes, classId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;
    if (isSundayISO(date)) return toast.error("Sunday is already a leave — no need to mark.");
    setSaving(true);
    const { error } = await supabase
      .from("class_holidays")
      .upsert({ class_id: classId, date, reason }, { onConflict: "class_id,date" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Holiday saved ✓");
    qc.invalidateQueries();
    nav({ to: "/app" });
  };

  return (
    <div className="max-w-md mx-auto space-y-5 animate-slide-up">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-accent flex items-center justify-center">
          <Palmtree className="h-4 w-4 text-accent-foreground" />
        </span>
        Mark Holiday
      </h1>

      <form onSubmit={submit} className="rounded-2xl border bg-card p-5 shadow-sm space-y-5">
        {/* Class */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Class
          </label>
          <select
            value={classId ?? ""}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
          >
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.dept_name} · {c.year_label} · {c.name}
              </option>
            ))}
          </select>
        </div>

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
          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarCheck2 className="h-3.5 w-3.5" />
            {prettyDate(date)}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Reason
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={200}
            placeholder="e.g. College holiday, Festival, Exam"
            className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
          />
        </div>

        <button
          disabled={saving}
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-xl gradient-primary text-primary-foreground py-3.5 text-sm font-medium shadow-sm btn-press"
        >
          <Palmtree className="h-4 w-4" />
          {saving ? "Saving…" : "Save Holiday"}
        </button>
      </form>

      <div className="rounded-2xl border bg-accent/8 border-accent/20 p-4 text-sm">
        <p className="text-muted-foreground leading-relaxed">
          Marking a holiday prevents attendance from being required for this class on the selected
          date. Sundays are automatically treated as holidays.
        </p>
      </div>
    </div>
  );
}
