-- ZapModel: integridade, segurança e gestão de usuários

create unique index if not exists contact_company_number_uq
  on public."Contact" ("companyId", number);

create unique index if not exists contact_company_whatsapp_jid_uq
  on public."Contact" ("companyId", "whatsappJid")
  where "whatsappJid" is not null;

create unique index if not exists message_external_id_uq
  on public."Message" ("externalId")
  where "externalId" is not null;

create index if not exists schedule_pending_idx
  on public."Schedule" ("scheduledAt")
  where "sentAt" is null;

create index if not exists ticket_contact_session_status_idx
  on public."Ticket" ("companyId", "contactId", "sessionId", status);

create or replace function public.ensure_profile(p_name text default null)
returns public."User"
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid text := auth.uid()::text;
  v_email text;
  v_company text;
  v_role public."UserRole";
  v_active boolean;
  v_row public."User";
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;

  select * into v_row from public."User" where id = v_uid;
  if found then return v_row; end if;

  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then raise exception 'Conta sem e-mail'; end if;

  if v_email = 'seg.adair@gmail.com' then
    v_role := 'OWNER';
    v_active := true;
  else
    v_role := 'AGENT';
    v_active := false;
  end if;

  select id into v_company from public."Company" order by "createdAt" asc limit 1;
  if v_company is null then
    insert into public."Company"(id, name) values (gen_random_uuid()::text, 'ZapModel')
    returning id into v_company;
  end if;

  insert into public."User"(id, name, email, "passwordHash", role, active, "companyId")
  values (
    v_uid,
    coalesce(nullif(btrim(p_name), ''), split_part(v_email, '@', 1)),
    v_email,
    '',
    v_role,
    v_active,
    v_company
  )
  returning * into v_row;

  return v_row;
end
$$;

create or replace function public.set_user_active(p_user_id text, p_active boolean)
returns public."User"
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public."User";
  v_target public."User";
begin
  select * into v_actor from public."User" where id = auth.uid()::text;
  if not found or v_actor.active is not true or v_actor.role not in ('OWNER','ADMIN') then
    raise exception 'Permissão insuficiente';
  end if;

  select * into v_target from public."User" where id = p_user_id and "companyId" = v_actor."companyId";
  if not found then raise exception 'Usuário não encontrado'; end if;
  if v_target.role = 'OWNER' then raise exception 'O proprietário não pode ser desativado'; end if;

  update public."User"
  set active = p_active, "updatedAt" = now()
  where id = p_user_id
  returning * into v_target;

  return v_target;
end
$$;

create or replace function public.set_user_role(p_user_id text, p_role public."UserRole")
returns public."User"
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public."User";
  v_target public."User";
begin
  select * into v_actor from public."User" where id = auth.uid()::text;
  if not found or v_actor.active is not true or v_actor.role <> 'OWNER' then
    raise exception 'Somente o proprietário pode alterar perfis';
  end if;

  if p_role = 'OWNER' then raise exception 'Não é permitido criar outro proprietário'; end if;

  select * into v_target from public."User" where id = p_user_id and "companyId" = v_actor."companyId";
  if not found then raise exception 'Usuário não encontrado'; end if;
  if v_target.role = 'OWNER' then raise exception 'O perfil do proprietário não pode ser alterado'; end if;

  update public."User"
  set role = p_role, "updatedAt" = now()
  where id = p_user_id
  returning * into v_target;

  return v_target;
end
$$;

grant execute on function public.set_user_active(text, boolean) to authenticated;
grant execute on function public.set_user_role(text, public."UserRole") to authenticated;
