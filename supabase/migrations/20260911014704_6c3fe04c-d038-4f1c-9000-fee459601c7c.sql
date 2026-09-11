-- ============ ajustes estruturais ============
ALTER TABLE public."User" ALTER COLUMN "passwordHash" SET DEFAULT '';
ALTER TABLE public."Company" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- ============ funções auxiliares ============
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u."companyId" FROM public."User" u WHERE u.id = auth.uid()::text LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.role::text FROM public."User" u WHERE u.id = auth.uid()::text LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."User" u
    WHERE u.id = auth.uid()::text AND u.active AND u.role IN ('OWNER','ADMIN')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_app_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public."User" u WHERE u.id = auth.uid()::text AND u.active)
$$;

-- ============ trava do perfil OWNER ============
CREATE OR REPLACE FUNCTION public.enforce_owner_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'OWNER' AND lower(NEW.email) <> 'seg.adair@gmail.com' THEN
    RAISE EXCEPTION 'Somente o e-mail proprietário pode ter o perfil OWNER';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_owner_email_trg ON public."User";
CREATE TRIGGER enforce_owner_email_trg
  BEFORE INSERT OR UPDATE ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_email();

-- ============ provisionamento seguro de perfil/empresa ============
CREATE OR REPLACE FUNCTION public.ensure_profile(p_name text DEFAULT NULL)
RETURNS public."User" LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_email text;
  v_company text;
  v_role "UserRole";
  v_row public."User";
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_row FROM public."User" WHERE id = v_uid;
  IF FOUND THEN RETURN v_row; END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'Conta sem e-mail'; END IF;

  IF v_email = 'seg.adair@gmail.com' THEN v_role := 'OWNER'; ELSE v_role := 'AGENT'; END IF;

  SELECT id INTO v_company FROM public."Company" ORDER BY "createdAt" ASC LIMIT 1;
  IF v_company IS NULL THEN
    INSERT INTO public."Company"(id, name) VALUES (gen_random_uuid()::text, 'ZapModel')
    RETURNING id INTO v_company;
  END IF;

  INSERT INTO public."User"(id, name, email, "passwordHash", role, "companyId")
  VALUES (v_uid, COALESCE(NULLIF(btrim(p_name), ''), split_part(v_email,'@',1)), v_email, '', v_role, v_company)
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.ensure_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id(), public.current_app_role(), public.is_app_admin(), public.is_app_member() TO authenticated;

-- ============ grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public."Company", public."User", public."Contact", public."Queue", public."QuickMessage",
  public."Tag", public."Task", public."Schedule", public."Campaign", public."CampaignContact",
  public."Ticket", public."TicketTag", public."Message", public."Setting", public."ApiToken",
  public."FileAsset", public."WhatsAppSession", public."AuditLog"
TO authenticated;
GRANT ALL ON
  public."Company", public."User", public."Contact", public."Queue", public."QuickMessage",
  public."Tag", public."Task", public."Schedule", public."Campaign", public."CampaignContact",
  public."Ticket", public."TicketTag", public."Message", public."Setting", public."ApiToken",
  public."FileAsset", public."WhatsAppSession", public."AuditLog"
TO service_role;

-- ============ RLS ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Company','User','Contact','Queue','QuickMessage','Tag','Task','Schedule',
                           'Campaign','CampaignContact','Ticket','TicketTag','Message','Setting',
                           'ApiToken','FileAsset','WhatsAppSession','AuditLog']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Company
CREATE POLICY "company_select" ON public."Company" FOR SELECT TO authenticated USING (id = public.current_company_id());
CREATE POLICY "company_update" ON public."Company" FOR UPDATE TO authenticated USING (id = public.current_company_id() AND public.is_app_admin()) WITH CHECK (id = public.current_company_id());

-- User
CREATE POLICY "user_select" ON public."User" FOR SELECT TO authenticated USING ("companyId" = public.current_company_id() OR id = auth.uid()::text);
CREATE POLICY "user_insert" ON public."User" FOR INSERT TO authenticated WITH CHECK ("companyId" = public.current_company_id() AND public.is_app_admin());
CREATE POLICY "user_update" ON public."User" FOR UPDATE TO authenticated USING ("companyId" = public.current_company_id() AND (public.is_app_admin() OR id = auth.uid()::text)) WITH CHECK ("companyId" = public.current_company_id());
CREATE POLICY "user_delete" ON public."User" FOR DELETE TO authenticated USING ("companyId" = public.current_company_id() AND public.is_app_admin() AND id <> auth.uid()::text);

-- tabelas administradas por OWNER/ADMIN
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Queue','QuickMessage','Tag','Campaign','Setting','ApiToken','WhatsAppSession','AuditLog']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ("companyId" = public.current_company_id())', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ("companyId" = public.current_company_id() AND public.is_app_admin())', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ("companyId" = public.current_company_id() AND public.is_app_admin()) WITH CHECK ("companyId" = public.current_company_id())', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ("companyId" = public.current_company_id() AND public.is_app_admin())', t||'_delete', t);
  END LOOP;
END $$;

-- tabelas operacionais (qualquer perfil ativo da empresa)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Contact','Task','Schedule','Ticket','FileAsset']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ("companyId" = public.current_company_id())', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ("companyId" = public.current_company_id() AND public.is_app_member())', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ("companyId" = public.current_company_id() AND public.is_app_member()) WITH CHECK ("companyId" = public.current_company_id())', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ("companyId" = public.current_company_id() AND public.is_app_member())', t||'_delete', t);
  END LOOP;
END $$;

-- Message (via Ticket)
CREATE POLICY "message_all" ON public."Message" FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public."Ticket" t WHERE t.id = "ticketId" AND t."companyId" = public.current_company_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public."Ticket" t WHERE t.id = "ticketId" AND t."companyId" = public.current_company_id()));

-- TicketTag (via Ticket)
CREATE POLICY "tickettag_all" ON public."TicketTag" FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public."Ticket" t WHERE t.id = "ticketId" AND t."companyId" = public.current_company_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public."Ticket" t WHERE t.id = "ticketId" AND t."companyId" = public.current_company_id()));

-- CampaignContact (via Campaign)
CREATE POLICY "campaigncontact_all" ON public."CampaignContact" FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public."Campaign" c WHERE c.id = "campaignId" AND c."companyId" = public.current_company_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public."Campaign" c WHERE c.id = "campaignId" AND c."companyId" = public.current_company_id()));