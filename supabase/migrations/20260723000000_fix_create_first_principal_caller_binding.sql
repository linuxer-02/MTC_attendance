-- Security fix: create_first_principal previously trusted a client-supplied
-- target_email and was granted to `anon`, so anyone (even unauthenticated)
-- could bootstrap themselves — or any other existing user — as Principal
-- during the setup window. It now always binds to the authenticated caller
-- (auth.uid()) and requires a session.

CREATE OR REPLACE FUNCTION public.create_first_principal(target_email TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  principal_exists BOOLEAN;
  calling_user_id UUID;
BEGIN
  calling_user_id := auth.uid();

  IF calling_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to set up the principal account.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'principal') INTO principal_exists;

  IF principal_exists THEN
    RAISE EXCEPTION 'A principal already exists in the system.';
  END IF;

  -- Any client-supplied target_email is ignored: the principal role is
  -- always granted to the caller, never to an arbitrary account.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (calling_user_id, 'principal');

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_first_principal(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_first_principal(TEXT) TO authenticated;
