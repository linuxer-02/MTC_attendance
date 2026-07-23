-- Helper function to check if any principal exists
CREATE OR REPLACE FUNCTION public.has_any_principal()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'principal');
$$;

GRANT EXECUTE ON FUNCTION public.has_any_principal TO anon, authenticated;

-- Helper function to safely set up the first principal user
CREATE OR REPLACE FUNCTION public.create_first_principal(target_email TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  principal_exists BOOLEAN;
  target_user_id UUID;
BEGIN
  -- Verify no principal currently exists
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'principal') INTO principal_exists;
  
  IF principal_exists THEN
    RAISE EXCEPTION 'A principal already exists in the system.';
  END IF;
  
  -- Resolve user ID by email
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;
  
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found.', target_email;
  END IF;
  
  -- Assign principal role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'principal');
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_first_principal(TEXT) TO anon, authenticated;
