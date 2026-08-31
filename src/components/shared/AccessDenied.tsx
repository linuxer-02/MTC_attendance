import { ShieldAlert } from "lucide-react";

/** The gate shown on Principal/Admin-only screens (staff index, report, register). */
export function AccessDenied({
  message = "Staff attendance is for the Principal and Admin only.",
}: {
  message?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-8 mt-6 text-center animate-slide-up shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-3xl display">Access Denied</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{message}</p>
    </div>
  );
}

/** Matching skeleton for while the role query is still resolving. */
export function AccessCheckSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
