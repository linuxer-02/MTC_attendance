import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMyRoles } from "@/features/shared/roles";
import { StaffRosterSection } from "@/features/staff/StaffRosterSection";
import { StaffMarkSection } from "@/features/staff/StaffMarkSection";
import { Briefcase, Users, CalendarCheck, Info } from "lucide-react";
import { AccessDenied, AccessCheckSkeleton } from "@/components/shared/AccessDenied";

export const Route = createFileRoute("/_authenticated/app/staff/")({
  head: () => ({ meta: [{ title: "Staff Attendance — Smart Attend Hub" }] }),
  component: StaffPage,
});

type Section = "mark" | "roster";

function StaffPage() {
  const { data: roles, isLoading } = useMyRoles();
  const canAccess = roles?.some((r) => r.role === "principal" || r.role === "admin");
  const [section, setSection] = useState<Section>("mark");

  if (isLoading) {
    return <AccessCheckSkeleton />;
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
          <Briefcase className="h-4 w-4 text-primary-foreground" />
        </span>
        Staff Attendance
      </h1>

      <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed flex gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Add staff in the Roster section, then switch to Mark to set each staff member's status for
          a date — <b>P</b>=Present, <b>A</b>=Absent, <b>OD</b>=On Duty, <b>ML</b>=Medical Leave,{" "}
          <b>CL</b>=Casual Leave, <b>HL</b>=Half-Day Leave, <b>LA</b>=Late Arrival. Open the
          Register tab below for auto-totalled monthly counts and attendance %.
        </span>
      </div>

      <div className="flex gap-1.5 rounded-2xl border bg-card p-1.5 shadow-sm">
        <button
          onClick={() => setSection("mark")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all duration-200 ${
            section === "mark"
              ? "gradient-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarCheck className="h-4 w-4" />
          Mark
        </button>
        <button
          onClick={() => setSection("roster")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all duration-200 ${
            section === "roster"
              ? "gradient-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Roster
        </button>
      </div>

      {section === "mark" && <StaffMarkSection />}
      {section === "roster" && <StaffRosterSection />}
    </div>
  );
}
