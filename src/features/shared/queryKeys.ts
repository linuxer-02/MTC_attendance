/**
 * Central React Query key factory.
 *
 * Every screen that reads the same table must build its key from here. The keys
 * are hierarchical: each family shares a root segment ("attendance", "holidays",
 * …) so a single `invalidateQueries({ queryKey: root })` refreshes every screen
 * reading that table, regardless of the date range or class it happens to use.
 *
 * This replaces the previous ad-hoc strings ("att-today", "att-week",
 * "att-month", "att-month-register", "att-day-register", "att-academic-year",
 * "absentees"), where each writer had to remember to invalidate all six — and
 * never did, leaving Analytics/Report showing stale data after marking.
 */

export const qk = {
  // ── Auth / roles ────────────────────────────────────────────────
  roles: () => ["my-roles"] as const,
  classesRoot: () => ["my-classes"] as const,
  myClasses: (roleCount: number) => ["my-classes", roleCount] as const,

  // ── Students ────────────────────────────────────────────────────
  studentsRoot: () => ["students"] as const,
  students: (classId: string | null | undefined) => ["students", classId ?? null] as const,

  // ── Student attendance ──────────────────────────────────────────
  attendanceRoot: () => ["attendance"] as const,
  /** One class over an inclusive date range. Use from === to for a single day. */
  attendance: (classId: string | null | undefined, from: string, to: string) =>
    ["attendance", classId ?? null, from, to] as const,
  /** Many classes on one date (the scoped Report page). */
  attendanceForClasses: (classIds: readonly string[], date: string) =>
    ["attendance", "multi", [...classIds].sort().join(","), date] as const,

  // ── Class holidays ──────────────────────────────────────────────
  holidaysRoot: () => ["holidays"] as const,
  holidays: (classId: string | null | undefined, from: string, to: string) =>
    ["holidays", classId ?? null, from, to] as const,

  // ── Staff ───────────────────────────────────────────────────────
  staffMembers: () => ["staff-members"] as const,
  staffAttendanceRoot: () => ["staff-attendance"] as const,
  staffAttendance: (from: string, to: string) => ["staff-attendance", from, to] as const,

  // ── Admin-only structure lists ──────────────────────────────────
  allDepts: () => ["all-depts"] as const,
  allYears: (deptIds?: unknown) => ["all-years", deptIds ?? null] as const,
  allClasses: (deptIds?: unknown) => ["all-classes", deptIds ?? null] as const,
  allProfiles: () => ["all-profiles"] as const,
  allRoles: () => ["all-roles"] as const,
} as const;
