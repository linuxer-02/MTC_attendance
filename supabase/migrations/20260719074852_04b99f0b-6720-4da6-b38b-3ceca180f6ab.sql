
-- Enums
CREATE TYPE public.app_role AS ENUM ('principal', 'hod', 'incharge');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent');

-- Departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Years
CREATE TABLE public.years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dept_id, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.years TO authenticated;
GRANT ALL ON public.years TO service_role;
ALTER TABLE public.years ENABLE ROW LEVEL SECURITY;

-- Classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id UUID NOT NULL REFERENCES public.years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(year_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  roll_no TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_id, roll_no)
);
CREATE INDEX ON public.students(class_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  dept_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, dept_id, class_id)
);
CREATE INDEX ON public.user_roles(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Attendance
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status public.attendance_status NOT NULL,
  marked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);
CREATE INDEX ON public.attendance(class_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Class holidays
CREATE TABLE public.class_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(class_id, date)
);
CREATE INDEX ON public.class_holidays(class_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_holidays TO authenticated;
GRANT ALL ON public.class_holidays TO service_role;
ALTER TABLE public.class_holidays ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_principal(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'principal');
$$;

CREATE OR REPLACE FUNCTION public.hod_dept_ids(_user_id UUID)
RETURNS SETOF UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT dept_id FROM public.user_roles WHERE user_id = _user_id AND role = 'hod' AND dept_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.incharge_class_ids(_user_id UUID)
RETURNS SETOF UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT class_id FROM public.user_roles WHERE user_id = _user_id AND role = 'incharge' AND class_id IS NOT NULL;
$$;

-- Helper: get dept id for a class
CREATE OR REPLACE FUNCTION public.class_dept_id(_class_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT y.dept_id FROM public.classes c JOIN public.years y ON y.id = c.year_id WHERE c.id = _class_id;
$$;

-- RLS: departments
CREATE POLICY "dept read all authenticated" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept principal write" ON public.departments FOR ALL TO authenticated
  USING (public.is_principal(auth.uid())) WITH CHECK (public.is_principal(auth.uid()));

-- RLS: years
CREATE POLICY "years read all" ON public.years FOR SELECT TO authenticated USING (true);
CREATE POLICY "years principal write" ON public.years FOR ALL TO authenticated
  USING (public.is_principal(auth.uid()) OR dept_id IN (SELECT public.hod_dept_ids(auth.uid())))
  WITH CHECK (public.is_principal(auth.uid()) OR dept_id IN (SELECT public.hod_dept_ids(auth.uid())));

-- RLS: classes
CREATE POLICY "classes read all" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "classes admin write" ON public.classes FOR ALL TO authenticated
  USING (
    public.is_principal(auth.uid())
    OR (SELECT y.dept_id FROM public.years y WHERE y.id = year_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  )
  WITH CHECK (
    public.is_principal(auth.uid())
    OR (SELECT y.dept_id FROM public.years y WHERE y.id = year_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  );

-- RLS: students
CREATE POLICY "students read scoped" ON public.students FOR SELECT TO authenticated USING (
  public.is_principal(auth.uid())
  OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  OR class_id IN (SELECT public.incharge_class_ids(auth.uid()))
);
CREATE POLICY "students admin write" ON public.students FOR ALL TO authenticated
  USING (
    public.is_principal(auth.uid())
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  )
  WITH CHECK (
    public.is_principal(auth.uid())
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  );

-- RLS: profiles
CREATE POLICY "profiles read own or principal" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_principal(auth.uid()) OR public.has_role(auth.uid(), 'hod'));
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_principal(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_principal(auth.uid()));

-- RLS: user_roles
CREATE POLICY "roles read own" ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_principal(auth.uid())
    OR (role = 'incharge' AND (
      SELECT public.class_dept_id(class_id)
    ) IN (SELECT public.hod_dept_ids(auth.uid())))
  );
CREATE POLICY "roles principal write" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_principal(auth.uid()))
  WITH CHECK (public.is_principal(auth.uid()));
CREATE POLICY "roles hod write incharges in dept" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    role = 'incharge'
    AND class_id IS NOT NULL
    AND public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  );
CREATE POLICY "roles hod delete incharges in dept" ON public.user_roles FOR DELETE TO authenticated
  USING (
    role = 'incharge'
    AND class_id IS NOT NULL
    AND public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  );

-- RLS: attendance
CREATE POLICY "att read scoped" ON public.attendance FOR SELECT TO authenticated USING (
  public.is_principal(auth.uid())
  OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  OR class_id IN (SELECT public.incharge_class_ids(auth.uid()))
);
CREATE POLICY "att write incharge" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal(auth.uid())
  );
CREATE POLICY "att update incharge" ON public.attendance FOR UPDATE TO authenticated
  USING (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal(auth.uid())
  )
  WITH CHECK (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal(auth.uid())
  );

-- RLS: class_holidays
CREATE POLICY "holidays read scoped" ON public.class_holidays FOR SELECT TO authenticated USING (
  public.is_principal(auth.uid())
  OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
  OR class_id IN (SELECT public.incharge_class_ids(auth.uid()))
);
CREATE POLICY "holidays write scoped" ON public.class_holidays FOR ALL TO authenticated
  USING (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal(auth.uid())
  )
  WITH CHECK (
    class_id IN (SELECT public.incharge_class_ids(auth.uid()))
    OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
    OR public.is_principal(auth.uid())
  );

-- Trigger: create profile on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: attendance updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER attendance_updated_at BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
