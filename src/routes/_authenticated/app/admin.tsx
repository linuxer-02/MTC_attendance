import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMyRoles } from "@/features/shared/roles";
import { StructureTab } from "@/features/admin/StructureTab";
import { StaffTab } from "@/features/admin/StaffTab";
import { StudentsTab } from "@/features/admin/StudentsTab";
import { Building2, Users, GraduationCap, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({ meta: [{ title: "Admin — Smart Attend Hub" }] }),
  component: AdminPage,
});

type Tab = "structure" | "staff" | "students";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "structure", label: "Structure", icon: Building2 },
  { key: "staff", label: "Staff", icon: Users },
  { key: "students", label: "Students", icon: GraduationCap },
];

function AdminPage() {
  const { data: roles, isLoading } = useMyRoles();
  const isPrincipal = roles?.some((r) => r.role === "principal");
  const isHod = roles?.some((r) => r.role === "hod");
  const canAccess = isPrincipal || isHod;
  const [tab, setTab] = useState<Tab>("structure");

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-8 mt-6 text-center animate-slide-up shadow-sm">
        <div className="text-4xl mb-4">⏳</div>
        <h2 className="text-3xl display">Checking access...</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          Verifying your admin role before loading the panel.
        </p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="rounded-2xl border bg-card p-8 mt-6 text-center animate-slide-up shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-3xl display">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          Admin controls are for HODs and the Principal only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
          <ShieldAlert className="h-4 w-4 text-primary-foreground" />
        </span>
        Admin
      </h1>

      {/* Tab bar */}
      <div className="flex gap-1.5 rounded-2xl border bg-card p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all duration-200 ${
              tab === t.key
                ? "gradient-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "structure" && <StructureTab isPrincipal={!!isPrincipal} />}
      {tab === "staff" && <StaffTab isPrincipal={!!isPrincipal} />}
      {tab === "students" && <StudentsTab />}
    </div>
  );
}
