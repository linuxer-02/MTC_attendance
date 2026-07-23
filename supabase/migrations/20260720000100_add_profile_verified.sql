-- Add verification flag to user profiles
ALTER TABLE public.profiles
ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false;

-- Allow principals and HODs to update profile verification status
CREATE POLICY "profiles update admin" ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.is_principal(auth.uid())
    OR public.has_role(auth.uid(), 'hod')
    OR id = auth.uid()
  )
  WITH CHECK (
    public.is_principal(auth.uid())
    OR public.has_role(auth.uid(), 'hod')
    OR id = auth.uid()
  );
