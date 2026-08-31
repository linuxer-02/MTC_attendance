-- Staff attendance register: daily P/A/OD/ML/CL/HL/LA marking for a
-- standalone staff roster (like students: added directly by Principal/Admin,
-- no login account required). Visible/markable by principal + admin only —
-- HODs and incharges get no access at all, matching the "college admin
-- only" requirement.

CREATE TYPE public.staff_attendance_status AS ENUM (
  'present',
  'absent',
  'on_duty',
  'medical_leave',
  'casual_leave',
  'half_day_leave',
  'late_arrival'
);

CREATE TABLE public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status public.staff_attendance_status NOT NULL,
  marked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, date)
);
CREATE INDEX ON public.staff_attendance(date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER staff_attendance_updated_at BEFORE UPDATE ON public.staff_attendance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: principal or admin (the only roles allowed near staff attendance)
CREATE OR REPLACE FUNCTION public.is_principal_or_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('principal', 'admin')
  );
$$;

CREATE POLICY "staff members principal admin only" ON public.staff_members FOR ALL TO authenticated
  USING (public.is_principal_or_admin(auth.uid()))
  WITH CHECK (public.is_principal_or_admin(auth.uid()));

CREATE POLICY "staff att principal admin only" ON public.staff_attendance FOR ALL TO authenticated
  USING (public.is_principal_or_admin(auth.uid()))
  WITH CHECK (public.is_principal_or_admin(auth.uid()));

-- Admin mirrors principal for profiles, students, class attendance and
-- holidays (general "mirror principal" scope, unrelated to the staff
-- roster above). It intentionally does NOT get department/year/class
-- (structure) or user_roles (role assignment) access — those stay
-- principal/hod only, unchanged.

ALTER POLICY "profiles read own or principal" ON public.profiles
  USING (id = auth.uid() OR public.is_principal_or_admin(auth.uid()) OR public.has_role(auth.uid(), 'hod'));

ALTER POLICY "students read scoped" ON public.students
  USING (
    public.is_principal_or_admin(auth.uid())
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR class_id IN (SELECT public.incharge_class_ids(auth.uid()))
  );
ALTER POLICY "students admin write" ON public.students
  USING (
    public.is_principal_or_admin(auth.uid())
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  )
  WITH CHECK (
    public.is_principal_or_admin(auth.uid())
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  );

ALTER POLICY "att read scoped" ON public.attendance
  USING (
    public.is_principal_or_admin(auth.uid())
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR class_id IN (SELECT public.incharge_class_ids(auth.uid()))
  );
ALTER POLICY "att write incharge" ON public.attendance
  WITH CHECK (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal_or_admin(auth.uid())
  );
ALTER POLICY "att update incharge" ON public.attendance
  USING (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal_or_admin(auth.uid())
  )
  WITH CHECK (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal_or_admin(auth.uid())
  );

ALTER POLICY "holidays read scoped" ON public.class_holidays
  USING (
    public.is_principal_or_admin(auth.uid())
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR class_id IN (SELECT public.incharge_class_ids(auth.uid()))
  );
ALTER POLICY "holidays write scoped" ON public.class_holidays
  USING (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal_or_admin(auth.uid())
  )
  WITH CHECK (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal_or_admin(auth.uid())
  );
