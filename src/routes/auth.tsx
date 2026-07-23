import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ClipboardCheck, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — Smart Attend Hub" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "setup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [hasPrincipal, setHasPrincipal] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    async function checkPrincipal() {
      try {
        const { data, error } = await supabase.rpc("has_any_principal");
        if (error) {
          console.warn(
            "Could not check principal status (migration might not be applied yet):",
            error.message,
          );
          setHasPrincipal(true); // fallback to standard mode
          return;
        }
        setHasPrincipal(!!data);
        if (data === false) {
          setMode("setup");
        }
      } catch (err: any) {
        console.warn("Error checking principal status:", err?.message ?? err);
        setHasPrincipal(true); // fallback
      }
    }
    checkPrincipal();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "setup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (signUpError) throw signUpError;

        const { error: rpcError } = await supabase.rpc("create_first_principal", {
          target_email: email,
        });
        if (rpcError) throw rpcError;

        toast.success("Principal account created successfully!");

        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) {
          toast.info("Setup complete! Please sign in with your new credentials.");
          setMode("signin");
          setHasPrincipal(true);
        } else {
          await router.invalidate();
          navigate({ to: "/app", replace: true });
        }
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created! Waiting for admin to assign your role.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      if (mode !== "setup") {
        await router.invalidate();
        navigate({ to: "/app", replace: true });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden gradient-bg">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, oklch(0.72 0.18 48), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, oklch(0.38 0.14 265), transparent 70%)" }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary shadow-lg mb-4">
            <ClipboardCheck className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-5xl display text-primary">
            Attend<span className="text-accent">Hub</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 display text-lg">
            {mode === "setup" ? "onboarding setup wizard" : "smart attendance register"}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl glass border shadow-xl p-6 animate-slide-up"
          style={{ animationDelay: "80ms" }}
        >
          {/* Mode toggle */}
          {hasPrincipal !== false && (
            <div className="flex gap-1 mb-6 p-1 bg-muted rounded-xl">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    mode === m
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {(mode === "signup" || mode === "setup") && (
              <div className="animate-slide-up">
                <Label
                  htmlFor="fullName"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  Full name
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Dr. Ananya Sharma"
                  className="mt-1.5 rounded-xl bg-background/60"
                />
              </div>
            )}

            <div>
              <Label
                htmlFor="email"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@college.edu"
                className="mt-1.5 rounded-xl bg-background/60"
              />
            </div>

            <div>
              <Label
                htmlFor="password"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  className="rounded-xl bg-background/60 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl gradient-primary border-0 text-primary-foreground font-medium py-2.5 btn-press shadow-md hover:shadow-lg transition-shadow"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Please wait…
                </span>
              ) : mode === "signin" ? (
                "Sign in →"
              ) : mode === "signup" ? (
                "Create account →"
              ) : (
                "Setup Principal Account →"
              )}
            </Button>
          </form>

          {mode === "signup" && (
            <p className="text-xs text-muted-foreground mt-4 text-center leading-relaxed">
              New accounts need a role assignment from your Principal or HOD before you can start
              marking attendance.
            </p>
          )}

          {mode === "setup" && (
            <p className="text-xs text-muted-foreground mt-4 text-center leading-relaxed font-semibold text-accent animate-fade-in">
              Welcome to AttendHub! Since no Principal exists in the database, this account will be
              automatically configured as the system Principal.
            </p>
          )}
        </div>

        <p
          className="text-center text-xs text-muted-foreground mt-6 animate-fade-in"
          style={{ animationDelay: "300ms" }}
        >
          Smart Attend Hub · Built for college staff
        </p>
      </div>
    </div>
  );
}
