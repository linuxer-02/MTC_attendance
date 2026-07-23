-- Security Migration: Add Attendance Delete RLS Policy & Audit Functions

-- Allow authorized incharge, HOD, and Principal users to delete/unmark attendance entries for their classes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance' AND policyname = 'att delete incharge'
  ) THEN
    CREATE POLICY "att delete incharge" ON public.attendance FOR DELETE TO authenticated
      USING (
        class_id IN (SELECT public.incharge_class_ids(auth.uid()))
        OR public.class_dept_id(class_id) IN (SELECT public.hod_dept_ids(auth.uid()))
        OR public.is_principal(auth.uid())
      );
  END IF;
END $$;
