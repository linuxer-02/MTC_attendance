import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "./queryKeys";

/**
 * Shared readers for the student roster / attendance / holiday tables.
 *
 * Every screen used to inline its own copy of these three queries with a
 * different key prefix. Routing them through here keeps the select lists and
 * the cache keys in one place, so invalidation actually reaches every reader.
 */

export type StudentRow = { id: string; name: string; roll_no: string };
export type AttendanceRow = { student_id: string; date: string; status: string };

/** Class roster, ordered by roll number. */
export function useClassStudents(classId: string | null | undefined) {
  return useQuery({
    enabled: !!classId,
    queryKey: qk.students(classId),
    queryFn: async (): Promise<StudentRow[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, roll_no")
        .eq("class_id", classId!)
        .order("roll_no");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Attendance rows for one class across an inclusive date range. */
export function useClassAttendance(
  classId: string | null | undefined,
  from: string,
  to: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    enabled: !!classId && from <= to && (options?.enabled ?? true),
    queryKey: qk.attendance(classId, from, to),
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, date, status")
        .eq("class_id", classId!)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Marked holidays for one class across an inclusive range, as a date Set. */
export function useClassHolidays(
  classId: string | null | undefined,
  from: string,
  to: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    enabled: !!classId && from <= to && (options?.enabled ?? true),
    queryKey: qk.holidays(classId, from, to),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("class_holidays")
        .select("date")
        .eq("class_id", classId!)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return new Set((data ?? []).map((h) => h.date));
    },
  });
}

/**
 * Invalidators. Writers call these instead of listing key strings by hand —
 * that hand-maintained list is what previously left Analytics and the Report
 * page stale after attendance was marked.
 */
export function useAttendanceInvalidator() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.attendanceRoot() });
  }, [qc]);
}

export function useHolidayInvalidator() {
  const qc = useQueryClient();
  return useCallback(() => {
    // Marking a day off changes both the holiday set and every derived
    // attendance figure (working days shrink), so refresh both families.
    qc.invalidateQueries({ queryKey: qk.holidaysRoot() });
    qc.invalidateQueries({ queryKey: qk.attendanceRoot() });
  }, [qc]);
}

export function useStudentsInvalidator() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.studentsRoot() });
    qc.invalidateQueries({ queryKey: qk.attendanceRoot() });
  }, [qc]);
}

/** Resolves the signed-in user id, or null once the session has expired. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
