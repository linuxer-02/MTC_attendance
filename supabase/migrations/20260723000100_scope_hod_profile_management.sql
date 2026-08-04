-- Security fix: "profiles update admin" previously let ANY hod update ANY
-- profile row (including full_name/email/verified) with no department
-- scoping at all, unlike every other hod-facing policy in this schema.
-- SELECT stays broad (hods/principal need to see unassigned signups to
-- assign them a role), but UPDATE is now scoped: a hod may only manage a
-- profile that is either unassigned to any department yet, or already tied
-- to their own department. A hod can never manage a principal's profile or
-- a user already scoped to a different department.

CREATE OR REPLACE FUNCTION public.hod_can_manage_profile(_hod_user_id UUID, _target_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _target_user_id
      AND (
        ur.role = 'principal'
        OR (ur.dept_id IS NOT NULL AND ur.dept_id NOT IN (SELECT public.hod_dept_ids(_hod_user_id)))
        OR (ur.class_id IS NOT NULL AND public.class_dept_id(ur.class_id) NOT IN (SELECT public.hod_dept_ids(_hod_user_id)))
      )
  );
$$;

DROP POLICY IF EXISTS "profiles update admin" ON public.profiles;
CREATE POLICY "profiles update admin scoped" ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_principal(auth.uid())
    OR (public.has_role(auth.uid(), 'hod') AND public.hod_can_manage_profile(auth.uid(), id))
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_principal(auth.uid())
    OR (public.has_role(auth.uid(), 'hod') AND public.hod_can_manage_profile(auth.uid(), id))
  );
