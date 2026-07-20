# From-scratch attendance register — build plan

Mobile-first web app for college staff. Supabase auth + Postgres, role-based (class incharge / HOD / principal), tap-to-mark attendance, week dashboard, absentee copy-out. Visual style inspired by the uploaded reference: hand-drawn, ink-on-cream, indigo `#1a2b4a` on cream `#f5efe0`, with a warm accent — subtle, not gimmicky.

## User roles

- **Principal (admin)** — assigns HODs, adds/removes class incharges, creates departments/years/classes, uploads students, marks any class holiday, sees everything.
- **HOD** — manages class incharges in their department, adds/removes class incharges, creates departments/years/classes, uploads students, marks any class holiday, sees everything, uploads students for their dept, sees dept-wide attendance/absentees and can do all the class incharges do.
- **Class Incharge** — marks attendance for assigned class(es), views weekly view, marks holidays for their class with reason.

First admin: developer-seeded via a post-migration SQL step (we'll ask you for the email of the Principal to seed).

## Core flows

1. **Login** — email/password (Supabase Auth). No signup UI; accounts created by higher roles.
2. **Home (week view)** — mobile card grid: last 7 days for the selected class. Colored dots per student per day (present/absent/holiday). Auto-scrolls to today. Sundays pre-shaded.
3. **Mark attendance (today)** — student list. Default = Present. 1 tap → Absent. 2nd tap → back to Present. Auto-saves per tap (debounced). Header shows live count "Absent: 4 / 62". "Finish day" button reveals absentee list + "Copy" button (formatted text to clipboard).
4. **Holiday toggle** — per class per day: "Mark holiday" with required reason. Sundays auto-holiday, no marking allowed.
5. **Admin screens** — Principal: departments, years, classes, HODs, incharges, student CSV upload. HOD: incharges + students within own dept.
6. **Absentee copy** — from Principal/HOD: scope selector (whole year / whole dept / single class) → generates and copies text.

## Data model (Supabase)

```text
departments (id, name, created_at)
years (id, dept_id, label)              -- e.g. dept CSE / "Year 2"
classes (id, year_id, name)             -- e.g. "CSE-2-A"
students (id, class_id, roll_no, name)
profiles (id=auth.uid, full_name, email)
app_role enum: principal | hod | incharge
user_roles (id, user_id, role, dept_id nullable, class_id nullable)
    -- principal: dept_id/class_id null
    -- hod: dept_id set
    -- incharge: class_id set
attendance (id, class_id, student_id, date, status, marked_by, updated_at)
    status enum: present | absent
class_holidays (id, class_id, date, reason, created_by)
```

Unique indexes: `(student_id, date)` on attendance; `(class_id, date)` on holidays.

`has_role(_user_id, _role)` SECURITY DEFINER function used in RLS. Sundays computed in app (not stored). Auto-date = client `today()` in the user's timezone, no manual date picker on the mark screen (a small "jump to date" affordance exists for corrections, gated to today-1 by default).

## RLS (summary)

- `profiles`: user reads own row; principal reads all.
- `user_roles`: user reads own; HOD reads incharges in own dept; principal reads/writes all; HOD writes only `role='incharge'` scoped to own dept.
- `departments/years/classes/students`: principal full; HOD read all, write own dept; incharge read own class(es).
- `attendance`: incharge insert/update rows for their class only; HOD/principal read their scope; nobody deletes.
- `class_holidays`: incharge write own class; HOD/principal write within scope.

All `public.*` tables get explicit `GRANT`s to `authenticated` + `service_role`.

## Screens

```text
/auth                    login
/                        redirects by role
/app                     (auth gate) week dashboard for chosen class
/app/mark                today's attendance for chosen class
/app/absentees           end-of-day copy tool (scope selector for HOD/principal)
/app/admin/students      CSV upload (principal + hod)
/app/admin/structure     departments / years / classes (principal)
/app/admin/staff         HODs + incharges (principal + hod scoped)
/app/holiday             mark day as holiday with reason
```

Layout: bottom tab bar (Home / Mark / Absentees / Admin) on mobile; hidden tabs by role.

## Modules (folders)

```text
src/features/
  auth/          session, login page, role hook
  attendance/    mark screen, week view, tap logic, autosave
  roster/        students, classes, years, departments, CSV import
  staff/         HOD + incharge management
  reports/       absentee builder + clipboard export
  holidays/      holiday marking + Sunday logic
  shared/        date utils, role-gate components, UI primitives
```

Each feature has its own `*.functions.ts` (server fns, RLS-scoped), `components/`, and `hooks/`. Routes are thin shells that compose feature components.

## Tech details

- TanStack Start (already scaffolded) + Supabase (enable Lovable Cloud in step 1).
- Server functions with `requireSupabaseAuth` for all writes and role-scoped reads. Public reads = none.
- CSV parsing client-side (Papa Parse), rows sent to a server fn that validates + bulk-inserts under RLS.
- Clipboard: `navigator.clipboard.writeText` with a plain-text template grouped by class.
- Design tokens in `src/styles.css` (cream bg, ink text, hand-drawn feel via a display font pair + subtle wavy dividers). Semantic tokens only — no hardcoded colors in components.
- Auto date: `date-fns` + `Intl.DateTimeFormat` for IST; Sunday check with `getDay() === 0`.

## Build order

1. Enable Lovable Cloud.
2. Migration: enum, all tables, `has_role`, RLS + GRANTs, indexes.
3. Seed developer-provided Principal email (I'll ask you for it right before this step).
4. Auth route + role-aware root redirect + `_authenticated` gate + bottom tab shell.
5. Admin: departments → years → classes → student CSV import.
6. Staff management (HODs + incharges).
7. Mark attendance screen (tap logic + autosave + Sunday/holiday guard).
8. Week dashboard.
9. Holiday marking.
10. Absentee builder + clipboard copy (per scope).
11. Design pass: cream/ink theme, hand-drawn accents, mobile polish.
12. Head metadata (title, description, OG).

## What I need from you before step 3

- Email address to seed as the first Principal.

Everything else (departments, years, classes, staff, students) is created inside the app by the Principal/HOD once logged in.
