-- Real staff rosters carry designation and department alongside the name
-- (e.g. "Asst. Professor" / "ECE"). These are plain informational fields —
-- unlike student class scoping, they don't affect RLS or admin's unscoped
-- access to staff attendance.
ALTER TABLE public.staff_members
  ADD COLUMN designation TEXT,
  ADD COLUMN department TEXT;
