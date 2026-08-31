import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Home,
  ClipboardCheck,
  ListChecks,
  Settings,
  LogOut,
  Sun,
  Moon,
  BarChart2,
  User,
  FileSpreadsheet,
  Briefcase,
  GraduationCap,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const toggleDark = () => window.dispatchEvent(new Event("toggle-dark-mode"));

  // role query used across screens
  const { data: myRoles } = useQuery({
    queryKey: ["my-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const hasRole = (r: "principal" | "hod" | "incharge" | "admin") =>
    myRoles?.some((x) => x.role === r) ?? false;
  const showAdminTab = hasRole("principal") || hasRole("hod") || hasRole("admin");
  const hasAnyRole = (myRoles?.length ?? 0) > 0;
  // Only Principal/Admin have a Staff side at all — everyone else stays on
  // the Student side with no chooser or switcher ever shown.
  const canSeeStaffMode = hasRole("principal") || hasRole("admin");
  const isStaffMode = pathname.startsWith("/app/staff");

  const MODE_CHOSEN_KEY = "attendhub-mode-chosen";
  const [showChooser, setShowChooser] = useState(false);
  useEffect(() => {
    if (!myRoles || !canSeeStaffMode || pathname !== "/app") return;
    if (sessionStorage.getItem(MODE_CHOSEN_KEY)) return;
    setShowChooser(true);
  }, [myRoles, canSeeStaffMode, pathname]);

  const chooseMode = (mode: "student" | "staff") => {
    sessionStorage.setItem(MODE_CHOSEN_KEY, "1");
    setShowChooser(false);
    if (mode === "staff") navigate({ to: "/app/staff" });
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const studentTabs = [
    { to: "/app", label: "Home", icon: Home, exact: true },
    { to: "/app/mark", label: "Mark", icon: ClipboardCheck },
    { to: "/app/absentees", label: "Report", icon: ListChecks },
    { to: "/app/entries", label: "Register", icon: FileSpreadsheet },
    ...(showAdminTab ? [{ to: "/app/admin", label: "Admin", icon: Settings }] : []),
  ];
  const staffTabs = [
    { to: "/app/staff", label: "Staff", icon: Briefcase, exact: true },
    { to: "/app/staff/report", label: "Report", icon: ListChecks },
    { to: "/app/staff/register", label: "Register", icon: FileSpreadsheet },
  ];
  const tabs = isStaffMode ? staffTabs : studentTabs;

  return (
    <div className="min-h-screen flex flex-col bg-background gradient-bg">
      {/* ── Student/Staff mode chooser (Principal/Admin, once per session) ── */}
      {showChooser && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 animate-slide-up">
          <div className="w-full max-w-sm space-y-4 text-center">
            <h2 className="text-3xl display">What would you like to do?</h2>
            <p className="text-sm text-muted-foreground">Pick which register to work in.</p>
            <div className="grid gap-3 pt-2">
              <button
                onClick={() => chooseMode("student")}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm hover:border-primary transition-colors btn-press"
              >
                <span className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shrink-0">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <span>
                  <div className="font-semibold">Student Attendance</div>
                  <div className="text-xs text-muted-foreground">Classes, mark, register</div>
                </span>
              </button>
              <button
                onClick={() => chooseMode("staff")}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm hover:border-primary transition-colors btn-press"
              >
                <span className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground shrink-0">
                  <Briefcase className="h-5 w-5" />
                </span>
                <span>
                  <div className="font-semibold">Staff Attendance</div>
                  <div className="text-xs text-muted-foreground">Roster, mark, register</div>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 glass-strong border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/app" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
              <ClipboardCheck className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-xl display text-primary font-semibold tracking-wide">
              Attend<span className="text-accent">Hub</span>
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {canSeeStaffMode && (
              <Link
                to={isStaffMode ? "/app" : "/app/staff"}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                aria-label={isStaffMode ? "Switch to Student side" : "Switch to Staff side"}
                title={isStaffMode ? "Switch to Student side" : "Switch to Staff side"}
              >
                {isStaffMode ? (
                  <GraduationCap className="h-4 w-4" />
                ) : (
                  <Briefcase className="h-4 w-4" />
                )}
              </Link>
            )}
            <Link
              to="/app/analytics"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              aria-label="Analytics"
              title="Analytics"
            >
              <BarChart2 className="h-4 w-4" />
            </Link>
            <Link
              to="/app/profile"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              aria-label="Profile"
              title="Profile"
            >
              <User className="h-4 w-4" />
            </Link>
            <button
              onClick={toggleDark}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className={`flex-1 w-full mx-auto px-4 pb-28 pt-5 transition-all duration-300 ${pathname.startsWith('/app/entries') ? 'max-w-[1600px]' : 'max-w-3xl'}`}>
        {!hasAnyRole ? (
          <div className="rounded-2xl border bg-card p-8 text-center mt-8 animate-slide-up shadow-sm">
            <div className="text-5xl mb-4">⏳</div>
            <h2 className="text-3xl display">Waiting on access</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-xs mx-auto leading-relaxed">
              Your account is set up, but no role has been assigned yet. Ask your Principal or HOD
              to add you as a class incharge.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* ── Bottom nav ── */}
      <nav className="fixed bottom-0 inset-x-0 z-20 glass-strong border-t">
        <div
          className="max-w-3xl mx-auto grid"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`relative flex flex-col items-center py-3 text-[10px] font-medium transition-all duration-200 ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full gradient-primary" />
                )}
                <t.icon
                  className={`h-5 w-5 mb-1 transition-transform duration-200 ${active ? "scale-110" : ""}`}
                />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
