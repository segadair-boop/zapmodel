CREATE OR REPLACE FUNCTION public.owner_claimed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public."User" WHERE role = 'OWNER')
$$;

REVOKE ALL ON FUNCTION public.owner_claimed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_claimed() TO anon, authenticated;