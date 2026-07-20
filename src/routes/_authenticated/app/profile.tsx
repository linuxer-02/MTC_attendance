import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/features/shared/roles";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User, Mail, Shield, Save, LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "Profile — Smart Attend Hub" }] }),
  component: ProfilePage,
});

const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  hod: "Head of Department",
  incharge: "Class Incharge",
};

const ROLE_COLORS: Record<string, string> = {
  principal: "bg-accent/15 text-accent-foreground border-accent/30",
  hod: "bg-primary/10 text-primary border-primary/20",
  incharge: "bg-success/10 text-success border-success/20",
};

function ProfilePage() {
  const { data: roles } = useMyRoles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setFullName(data.full_name);
        if (data?.email) setEmail(data.email);
      });
  }, [userId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="space-y-5 animate-slide-up max-w-md mx-auto">
      <h1 className="text-4xl display flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center">
          <User className="h-4 w-4 text-primary-foreground" />
        </span>
        Profile
      </h1>

      {/* Avatar card */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm text-center">
        <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-3xl text-primary-foreground font-bold display">
            {fullName ? fullName[0].toUpperCase() : email ? email[0].toUpperCase() : "?"}
          </span>
        </div>
        <h2 className="text-2xl display font-semibold">{fullName || "No name set"}</h2>
        <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          {email}
        </p>

        {/* Role badges */}
        {roles && roles.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {roles.map((r) => (
              <span
                key={r.id}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
                  ROLE_COLORS[r.role] ?? "bg-muted text-muted-foreground"
                }`}
              >
                <Shield className="h-3 w-3" />
                {ROLE_LABELS[r.role] ?? r.role}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Edit name */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <h3 className="text-xl display mb-4">Edit Profile</h3>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Full Name
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Ananya Sharma"
              className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Email
            </label>
            <input
              value={email}
              readOnly
              className="mt-1.5 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Email cannot be changed here.</p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl gradient-primary text-primary-foreground py-3 text-sm font-medium shadow-sm btn-press"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive py-3.5 text-sm font-medium hover:bg-destructive/10 transition-colors btn-press"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}
