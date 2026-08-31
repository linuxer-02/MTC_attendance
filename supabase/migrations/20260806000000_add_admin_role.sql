-- New 'admin' role: mirrors the principal everywhere EXCEPT it cannot
-- assign roles (user_roles) or manage the college structure
-- (departments/years/classes). Split into its own migration because a new
-- enum value cannot be referenced by policies in the same transaction it
-- was added in.
ALTER TYPE public.app_role ADD VALUE 'admin';
