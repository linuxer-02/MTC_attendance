import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/features/shared/queryKeys";
import type { Database } from "@/integrations/supabase/types";

export type StaffStatus = Database["public"]["Enums"]["staff_attendance_status"];

/**
 * The staff attendance code table. Previously duplicated between the Mark
 * section (value/code/label) and the Register grid (value/code/className),
 * which meant a new status had to be added in two places to show up in both.
 */
export const STAFF_STATUS_META: {
  value: StaffStatus;
  code: string;
  label: string;
  cellClass: string;
}[] = [
  {
    value: "present",
    code: "P",
    label: "Present",
    cellClass: "bg-success text-success-foreground",
  },
  {
    value: "absent",
    code: "A",
    label: "Absent",
    cellClass: "bg-destructive text-destructive-foreground",
  },
  {
    value: "on_duty",
    code: "OD",
    label: "On Duty",
    cellClass: "bg-accent/70 text-accent-foreground",
  },
  {
    value: "medical_leave",
    code: "ML",
    label: "Medical Leave",
    cellClass: "bg-primary/60 text-primary-foreground",
  },
  {
    value: "casual_leave",
    code: "CL",
    label: "Casual Leave",
    cellClass: "bg-primary/40 text-primary-foreground",
  },
  {
    value: "half_day_leave",
    code: "HL",
    label: "Half-Day Leave",
    cellClass: "bg-muted-foreground/40 text-foreground",
  },
  {
    value: "late_arrival",
    code: "LA",
    label: "Late Arrival",
    cellClass: "bg-accent text-accent-foreground",
  },
];

export function staffStatusMeta(status: StaffStatus) {
  return STAFF_STATUS_META.find((m) => m.value === status)!;
}

/** Statuses that count as having attended, for the register's % column. */
export const STAFF_ATTENDED_STATUSES: StaffStatus[] = ["present", "on_duty", "late_arrival"];

/** Pill colouring for a staff status in the Mark list. */
export function staffStatusPillClass(status: StaffStatus): string {
  if (status === "present") return "bg-success/15 text-success border-success/30";
  if (status === "absent") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-accent/15 text-accent border-accent/30";
}

export type StaffMember = {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
};

/** The staff roster — read by the Mark section, Roster section and Register. */
export function useStaffMembers() {
  return useQuery({
    queryKey: qk.staffMembers(),
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_members").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Staff attendance across an inclusive range; from === to reads a single day. */
export function useStaffAttendance(from: string, to: string) {
  return useQuery({
    enabled: from <= to,
    queryKey: qk.staffAttendance(from, to),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .select("staff_id, status, date")
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * One invalidator for every staff-attendance reader. The Mark section, the
 * Register grid and the daily Staff Report all read this table; previously the
 * Report's key was never invalidated, so it went stale after marking.
 */
export function useStaffAttendanceInvalidator() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.staffAttendanceRoot() });
  }, [qc]);
}

/** Invalidates the staff roster list (members, not attendance). */
export function useStaffMembersInvalidator() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.staffMembers() });
  }, [qc]);
}
