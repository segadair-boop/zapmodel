REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_app_member() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_profile(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_owner_email() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;