# Reusability / coupling refactor — in progress

**Status:** foundation built, 3 of 8 consumers migrated. `tsc --noEmit` passes.
**Branch:** `feature/staff-attendance`

---

## ⚠️ Step 0 — DO THIS FIRST (regression introduced by the partial migration)

Migrating only *some* screens to the new query keys broke two invalidation paths
that used to work. The app runs fine; the symptom is **stale data until remount**.

| Writer | Used to refresh | Now misses |
|---|---|---|
| `mark.tsx` (mark/submit attendance) | `att-week`, `att-month-register` | Home week grid, Register month grid |
| `holiday.tsx` (mark/unmark holiday) | `holi-month` | Analytics month + academic-year holidays |

**Two ways to close it:**

- **(a) Safety net, ~5 min** — have the shared invalidators in
  `src/features/shared/attendanceQueries.ts` also invalidate the legacy prefixes
  (`att-week`, `att-month-register`, `att-day-register`, `holi-week`,
  `holi-month`, `holi-month-register`, `holiday-check`, `holidays-month`).
  Delete those lines once step 1 is done.
- **(b) Just finish step 1** — migrate the remaining readers, and the legacy
  prefixes stop existing. Cleaner, ~30 min.

---

## What already exists (new, untracked)

| File | Purpose |
|---|---|
| `src/features/shared/queryKeys.ts` | `qk.*` factory. Hierarchical roots (`attendance`, `holidays`, `students`, `staff-attendance`) so one invalidate reaches every reader. |
| `src/features/shared/attendance.ts` | Domain rules: `attendancePct`, `workingDaysBetween`, Anna Univ R-2025 `eligibilityOf` + `ELIGIBILITY_META`, `defaultAcademicYearStart`, `pctToneClass`, `pctBarColor`, `MIN_ATTENDANCE_PCT` (75), `CONDONATION_MIN_PCT` (65). |
| `src/features/shared/attendanceQueries.ts` | `useClassStudents`, `useClassAttendance`, `useClassHolidays`, `use*Invalidator`, `currentUserId`. |
| `src/features/shared/useCopyShare.ts` | Clipboard + Web Share (keeps the AbortError special-case). |
| `src/features/staff/staffStatus.ts` | `STAFF_STATUS_META` (merged code+label+cellClass), `useStaffMembers`, `useStaffAttendance`, `useStaffAttendanceInvalidator`. **Written but not yet consumed.** |
| `src/components/shared/ClassSelect.tsx` | Dept · Year · Class picker + `classLabel()`. |
| `src/components/shared/StatTiles.tsx` | The rounded stat-tile row. |
| `src/components/shared/RosterIdentity.tsx` | Roll-no + name, fixed column widths. |
| `src/components/shared/AccessDenied.tsx` | Principal/Admin gate + skeleton. **Written but not yet consumed.** |
| `src/components/shared/ConfirmDialog.tsx` | In-app replacement for `window.confirm`. |
| `src/components/shared/ReportActions.tsx` | Copy/Share buttons + raw-text `<details>`. |

## Migrated ✅

- `analytics.tsx` — hooks, domain helpers, `ClassSelect`, `StatTiles`, `RosterIdentity`. Dropped ~120 lines of local duplication.
- `mark.tsx` — `useClassStudents`, `qk.*` keys, `useAttendanceInvalidator`, `ConfirmDialog`, `ClassSelect`, pct helpers.
- `absentees.tsx` — `qk.attendanceForClasses`, `useCopyShare`, `ReportActions`, `RawTextDetails`, `StatTiles`, `RosterIdentity`, `ClassSelect`.

## Step 1 — remaining consumers

1. **`holiday.tsx`** *(was mid-edit when we stopped)* — `qk.holidays`, `useHolidayInvalidator`, `ClassSelect`, `ConfirmDialog` (replaces the `confirm()` on unmark), `currentUserId`.
2. **`index.tsx`** (Home) — `useClassStudents`, `useClassAttendance`, `useClassHolidays`, `ClassSelect`, `StatTiles`.
3. **`entries.tsx`** — `qk.attendance` / `qk.holidays` for its month + day queries, `useAttendanceInvalidator`, `ClassSelect`, `RosterIdentity`, pct helpers. Largest file; go slow.
4. **`StaffMarkSection.tsx`** + **`staff/register.tsx`** — pull `STAFF_STATUS_META` from `staffStatus.ts`, swap to `useStaffMembers` / `useStaffAttendance` / `useStaffAttendanceInvalidator`.
5. **`staff/index.tsx`**, **`staff/report.tsx`**, **`staff/register.tsx`** — use `AccessDenied` + `AccessCheckSkeleton` (3 copies today). `report.tsx` also gets `useCopyShare` + `ReportActions`.
6. **`StudentsTab.tsx`** — **real bug**: reads `["students-admin", classId]` but invalidates `["students", classId]`, so the admin roster never refreshes after add/upload/delete. Fix via `qk.students` + `useStudentsInvalidator`.
7. **`StaffRosterSection.tsx`** — `useStaffMembers`, and replace the `confirm()` on delete with `ConfirmDialog`.

## Step 2 — verify

- `npx tsc --noEmit -p .`
- Grep for leftovers: `att-|holi-|students-admin|staff-att-` should return nothing.
- Manual: mark attendance → Home / Register / Analytics / Report all update without reload.
- Manual: mark a holiday → working-day counts drop everywhere.
- Manual: add a student in Admin → roster list updates immediately.

## Deliberately out of scope

- No behaviour or visual changes intended. `min-w-[4.5rem]`/`max-w-[7.5rem]` became
  `min-w-18`/`max-w-30` inside `RosterIdentity` — identical under Tailwind v4, just
  clears the lint warning.
- Academic-year start is still a UI date picker defaulting to June 1; there is no
  `semester_start` column in the schema. Worth adding before anyone relies on the
  eligibility numbers for real decisions.
