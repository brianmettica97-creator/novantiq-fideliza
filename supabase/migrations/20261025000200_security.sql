-- =============================================================================
-- NOVANTIQ Fideliza — Seguridad: roles, permisos, RLS, auditoría y límites
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Matriz de permisos (fuente única de verdad, espejada en src/lib/permissions.ts)
-- -----------------------------------------------------------------------------
create or replace function public.role_has_permission(p_role text, p_perm text)
returns boolean language sql immutable set search_path = '' as $$
  select case p_perm
    when 'operate'        then p_role in ('owner','admin','manager','staff')
    when 'customers.view' then p_role in ('owner','admin','manager','staff')
    when 'adjust'         then p_role in ('owner','admin','manager')
    when 'stats'          then p_role in ('owner','admin','manager')
    when 'config'         then p_role in ('owner','admin')
    when 'team'           then p_role in ('owner','admin')
    when 'audit'          then p_role in ('owner','admin')
    when 'billing'        then p_role = 'owner'
    else false
  end
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function public.current_role_in(p_merchant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.merchant_id = p_merchant and m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function public.is_member(p_merchant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_in(p_merchant) is not null
$$;

create or replace function public.has_permission(p_merchant uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.role_has_permission(public.current_role_in(p_merchant), p_perm), false)
$$;

-- ¿Puede el usuario actual operar en esa sucursal?
create or replace function public.can_operate_branch(p_merchant uuid, p_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.branches b on b.id = p_branch and b.merchant_id = m.merchant_id and b.active
    where m.merchant_id = p_merchant and m.user_id = auth.uid() and m.status = 'active'
      and (m.all_branches or m.role in ('owner','admin') or exists (
        select 1 from public.membership_branches mb
        where mb.membership_id = m.id and mb.branch_id = p_branch))
  )
$$;

-- -----------------------------------------------------------------------------
-- Planes, suscripción y estado operativo
-- -----------------------------------------------------------------------------
create or replace function public.setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.platform_settings where key = p_key
$$;

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.platform_settings where key = p_key), p_default)
$$;

create or replace function public.merchant_plan(p_merchant uuid)
returns public.plans language sql stable security definer set search_path = '' as $$
  select p.* from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.merchant_id = p_merchant
$$;

create or replace function public.plan_has_feature(p_merchant uuid, p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(((public.merchant_plan(p_merchant)).features ->> p_feature)::boolean, false)
$$;

-- 'ok' | 'suspended' | 'closed' | 'trial_expired' | 'subscription_inactive' | 'no_subscription'
create or replace function public.merchant_operational_status(p_merchant uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_m public.merchants;
  v_s public.subscriptions;
  v_grace int := coalesce((public.setting('billing.grace_days'))::text::int, 7);
begin
  select * into v_m from public.merchants where id = p_merchant;
  if not found then return 'closed'; end if;
  if v_m.status <> 'active' then return v_m.status; end if;
  select * into v_s from public.subscriptions where merchant_id = p_merchant;
  if not found then return 'no_subscription'; end if;
  if v_s.status = 'trialing' then
    return case when v_s.trial_ends_at > now() then 'ok' else 'trial_expired' end;
  elsif v_s.status = 'active' then
    return case when v_s.current_period_end is null
                  or v_s.current_period_end + make_interval(days => v_grace) > now()
                then 'ok' else 'subscription_inactive' end;
  elsif v_s.status = 'past_due' then
    return case when v_s.current_period_end is not null
                  and v_s.current_period_end + make_interval(days => v_grace) > now()
                then 'ok' else 'subscription_inactive' end;
  elsif v_s.status in ('cancelled','paused') then
    -- Cancelada: se respeta el período ya abonado.
    return case when v_s.current_period_end is not null and v_s.current_period_end > now()
                then 'ok' else 'subscription_inactive' end;
  end if;
  return 'subscription_inactive';
end $$;

create or replace function public.assert_operational(p_merchant uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v text := public.merchant_operational_status(p_merchant);
begin
  if v = 'ok' then return; end if;
  if v = 'suspended' then
    perform public._err('merchant_suspended', 'La cuenta de este comercio está suspendida.');
  elsif v = 'trial_expired' then
    perform public._err('trial_expired', 'La prueba gratuita del comercio finalizó. El titular debe activar una suscripción.');
  else
    perform public._err('subscription_inactive', 'La suscripción del comercio no está activa.');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Límite de frecuencia genérico (ventana fija)
-- -----------------------------------------------------------------------------
create or replace function public.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    perform public._err('rate_limited', 'Demasiados intentos seguidos. Esperá unos minutos y volvé a intentar.');
  end if;
end $$;

create or replace function public.cleanup_rate_limits()
returns int language sql security definer set search_path = '' as $$
  with d as (delete from public.rate_limits where window_start < now() - interval '2 days' returning 1)
  select count(*)::int from d
$$;

-- -----------------------------------------------------------------------------
-- Auditoría
-- -----------------------------------------------------------------------------
create or replace function public.log_audit(p_merchant uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (merchant_id, actor_id, action, entity, entity_id, details)
  values (p_merchant, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb; v_old jsonb; v_row jsonb; v_diff jsonb; v_merchant uuid; v_id text;
begin
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  v_row := coalesce(v_new, v_old);
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(key, jsonb_build_object('from', v_old -> key, 'to', value)), '{}'::jsonb)
      into v_diff
      from jsonb_each(v_new)
     where key not in ('updated_at','onboarding_data','redeemed_count') and value is distinct from v_old -> key;
    if v_diff = '{}'::jsonb then return new; end if;
  else
    v_diff := v_row;
  end if;
  v_merchant := case when tg_table_name = 'merchants' then (v_row ->> 'id')::uuid
                     else nullif(v_row ->> 'merchant_id', '')::uuid end;
  v_id := coalesce(v_row ->> 'id', v_row ->> 'merchant_id', v_row ->> 'key', v_row ->> 'user_id');
  insert into public.audit_log (merchant_id, actor_id, action, entity, entity_id, details)
  values (v_merchant, auth.uid(), lower(tg_op), tg_table_name, v_id, v_diff - 'token_hash');
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['merchants','subscriptions','branches','memberships','programs','rewards',
                           'promotions','plans','platform_settings','platform_admins','invitations']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row_change()', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Perfiles automáticos para cada usuario de auth
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Validaciones de negocio y límites por plan (triggers)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_branch_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max int := (public.merchant_plan(new.merchant_id)).max_branches; v_count int;
begin
  if new.active and (tg_op = 'INSERT' or not old.active) and v_max is not null then
    select count(*) into v_count from public.branches
     where merchant_id = new.merchant_id and active and id <> new.id;
    if v_count >= v_max then
      perform public._err('plan_limit', format('Tu plan permite hasta %s sucursal(es) activa(s).', v_max));
    end if;
  end if;
  return new;
end $$;
create trigger branches_limits before insert or update on public.branches
  for each row execute function public.enforce_branch_limits();

create or replace function public.program_rules(p public.programs)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'type', p.type, 'stamps_required', p.stamps_required, 'max_units_per_tx', p.max_units_per_tx,
    'earn_points', p.earn_points, 'earn_amount', p.earn_amount, 'max_points_per_tx', p.max_points_per_tx,
    'max_amount_per_tx', p.max_amount_per_tx, 'daily_limit_per_card', p.daily_limit_per_card,
    'min_minutes_between', p.min_minutes_between, 'welcome_bonus', p.welcome_bonus,
    'starts_at', p.starts_at, 'ends_at', p.ends_at, 'all_branches', p.all_branches, 'terms', p.terms)
$$;

create or replace function public.validate_program()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_max int; v_count int;
begin
  if tg_op = 'INSERT' then
    if new.type = 'points' and not public.plan_has_feature(new.merchant_id, 'points') then
      perform public._err('plan_feature', 'Los programas de puntos no están incluidos en tu plan.');
    end if;
    if new.type = 'milestones' and not public.plan_has_feature(new.merchant_id, 'milestones') then
      perform public._err('plan_feature', 'Las recompensas por hitos no están incluidas en tu plan.');
    end if;
    v_max := (public.merchant_plan(new.merchant_id)).max_programs;
    select count(*) into v_count from public.programs
     where merchant_id = new.merchant_id and status <> 'archived';
    -- Se permite hasta el doble en borradores para probar, pero solo max_programs activos (ver set_program_status).
    if v_max is not null and v_count >= v_max * 2 then
      perform public._err('plan_limit', format('Tu plan permite hasta %s programa(s).', v_max));
    end if;
  else
    if new.type <> old.type or new.merchant_id <> old.merchant_id then
      perform public._err('immutable', 'El tipo de programa no se puede cambiar. Duplicalo y creá uno nuevo.');
    end if;
    if old.status = 'archived' and new.status = 'archived' and public.program_rules(new) <> public.program_rules(old) then
      perform public._err('archived', 'Un programa archivado no se puede editar.');
    end if;
  end if;

  if new.type = 'visits' then new.max_units_per_tx := 1; end if;
  if new.type in ('stamps','visits') and new.max_units_per_tx > new.stamps_required then
    perform public._err('invalid_rules', 'El máximo de sellos por operación no puede superar los sellos necesarios.');
  end if;
  if new.type in ('points','milestones') then new.stamps_required := null; end if;
  if new.type <> 'points' then
    new.earn_points := null; new.earn_amount := null; new.max_points_per_tx := null; new.max_amount_per_tx := null;
  end if;
  if new.type = 'milestones' then new.max_units_per_tx := 1; end if;

  -- Versionado: cualquier cambio de reglas genera una versión nueva.
  if tg_op = 'UPDATE' and public.program_rules(new) is distinct from public.program_rules(old) then
    new.version := old.version + 1;
  end if;
  return new;
end $$;
create trigger programs_validate before insert or update on public.programs
  for each row execute function public.validate_program();

create or replace function public.snapshot_program_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.program_versions (program_id, merchant_id, version, rules, changed_by)
    values (new.id, new.merchant_id, new.version, public.program_rules(new), auth.uid())
    on conflict (program_id, version) do nothing;
  end if;
  return new;
end $$;
create trigger programs_snapshot after insert or update on public.programs
  for each row execute function public.snapshot_program_version();

create or replace function public.validate_reward()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_p public.programs;
begin
  select * into v_p from public.programs where id = new.program_id;
  if v_p.status = 'archived' and tg_op = 'INSERT' then
    perform public._err('archived', 'No se pueden agregar recompensas a un programa archivado.');
  end if;
  if v_p.type in ('stamps','visits') and new.cost > v_p.stamps_required then
    perform public._err('invalid_rules', format('La recompensa no puede requerir más de %s sellos.', v_p.stamps_required));
  end if;
  if v_p.type = 'milestones' and new.max_per_card is null then new.max_per_card := 1; end if;
  if tg_op = 'UPDATE' and (new.program_id <> old.program_id or new.merchant_id <> old.merchant_id) then
    perform public._err('immutable', 'La recompensa no se puede mover a otro programa.');
  end if;
  return new;
end $$;
create trigger rewards_validate before insert or update on public.rewards
  for each row execute function public.validate_reward();

create or replace function public.validate_promotion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and not public.plan_has_feature(new.merchant_id, 'promotions') then
    perform public._err('plan_feature', 'Las promociones no están incluidas en tu plan.');
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger promotions_validate before insert or update on public.promotions
  for each row execute function public.validate_promotion();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.plans               enable row level security;
alter table public.platform_admins     enable row level security;
alter table public.platform_settings   enable row level security;
alter table public.profiles            enable row level security;
alter table public.merchants           enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.billing_events      enable row level security;
alter table public.branches            enable row level security;
alter table public.memberships         enable row level security;
alter table public.membership_branches enable row level security;
alter table public.invitations         enable row level security;
alter table public.programs            enable row level security;
alter table public.program_versions    enable row level security;
alter table public.program_branches    enable row level security;
alter table public.rewards             enable row level security;
alter table public.reward_branches     enable row level security;
alter table public.promotions          enable row level security;
alter table public.cards               enable row level security;
alter table public.card_secrets        enable row level security;
alter table public.card_transactions   enable row level security;
alter table public.redemptions         enable row level security;
alter table public.audit_log           enable row level security;
alter table public.rate_limits         enable row level security;
alter table public.support_tickets     enable row level security;
alter table public.contact_requests    enable row level security;

-- Plataforma
create policy plans_read on public.plans for select to anon, authenticated
  using ((is_public and active) or public.is_platform_admin());
create policy plans_admin_write on public.plans for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create policy settings_read on public.platform_settings for select to anon, authenticated
  using (is_public or public.is_platform_admin());
create policy settings_admin_write on public.platform_settings for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Comercio
create policy merchants_read on public.merchants for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());
create policy merchants_update on public.merchants for update to authenticated
  using (public.has_permission(id, 'config')) with check (public.has_permission(id, 'config'));

create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.is_member(merchant_id) or public.is_platform_admin());

create policy billing_events_admin on public.billing_events for select to authenticated
  using (public.is_platform_admin());

create policy branches_read on public.branches for select to authenticated
  using (public.is_member(merchant_id) or public.is_platform_admin());
create policy branches_insert on public.branches for insert to authenticated
  with check (public.has_permission(merchant_id, 'config'));
create policy branches_update on public.branches for update to authenticated
  using (public.has_permission(merchant_id, 'config')) with check (public.has_permission(merchant_id, 'config'));

create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.has_permission(merchant_id, 'team') or public.is_platform_admin());
create policy membership_branches_read on public.membership_branches for select to authenticated
  using (public.has_permission(merchant_id, 'team') or exists (
    select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()));

create policy invitations_read on public.invitations for select to authenticated
  using (public.has_permission(merchant_id, 'team') or public.is_platform_admin());

create policy programs_read on public.programs for select to authenticated
  using (public.is_member(merchant_id) or public.is_platform_admin());
create policy programs_insert on public.programs for insert to authenticated
  with check (public.has_permission(merchant_id, 'config'));
create policy programs_update on public.programs for update to authenticated
  using (public.has_permission(merchant_id, 'config')) with check (public.has_permission(merchant_id, 'config'));

create policy program_versions_read on public.program_versions for select to authenticated
  using (public.is_member(merchant_id) or public.is_platform_admin());

create policy program_branches_read on public.program_branches for select to authenticated
  using (public.is_member(merchant_id));
create policy program_branches_insert on public.program_branches for insert to authenticated
  with check (public.has_permission(merchant_id, 'config'));
create policy program_branches_delete on public.program_branches for delete to authenticated
  using (public.has_permission(merchant_id, 'config'));

create policy rewards_read on public.rewards for select to authenticated
  using (public.is_member(merchant_id) or public.is_platform_admin());
create policy rewards_insert on public.rewards for insert to authenticated
  with check (public.has_permission(merchant_id, 'config'));
create policy rewards_update on public.rewards for update to authenticated
  using (public.has_permission(merchant_id, 'config')) with check (public.has_permission(merchant_id, 'config'));

create policy reward_branches_read on public.reward_branches for select to authenticated
  using (public.is_member(merchant_id));
create policy reward_branches_insert on public.reward_branches for insert to authenticated
  with check (public.has_permission(merchant_id, 'config'));
create policy reward_branches_delete on public.reward_branches for delete to authenticated
  using (public.has_permission(merchant_id, 'config'));

create policy promotions_read on public.promotions for select to authenticated
  using (public.is_member(merchant_id) or public.is_platform_admin());
create policy promotions_insert on public.promotions for insert to authenticated
  with check (public.has_permission(merchant_id, 'config'));
create policy promotions_update on public.promotions for update to authenticated
  using (public.has_permission(merchant_id, 'config')) with check (public.has_permission(merchant_id, 'config'));

-- Tarjetas: el comercio ve las suyas; el cliente ve solo las propias.
create policy cards_read on public.cards for select to authenticated
  using (customer_id = auth.uid() or public.has_permission(merchant_id, 'customers.view') or public.is_platform_admin());
create policy card_secrets_owner on public.card_secrets for select to authenticated
  using (exists (select 1 from public.cards c where c.id = card_id and c.customer_id = auth.uid()));
create policy card_tx_read on public.card_transactions for select to authenticated
  using (public.has_permission(merchant_id, 'customers.view') or public.is_platform_admin()
         or exists (select 1 from public.cards c where c.id = card_id and c.customer_id = auth.uid()));
create policy redemptions_read on public.redemptions for select to authenticated
  using (public.has_permission(merchant_id, 'customers.view') or public.is_platform_admin()
         or exists (select 1 from public.cards c where c.id = card_id and c.customer_id = auth.uid()));

create policy audit_read on public.audit_log for select to authenticated
  using ((merchant_id is not null and public.has_permission(merchant_id, 'audit')) or public.is_platform_admin());

create policy tickets_read on public.support_tickets for select to authenticated
  using (created_by = auth.uid() or (merchant_id is not null and public.has_permission(merchant_id, 'config'))
         or public.is_platform_admin());

create policy contact_admin on public.contact_requests for select to authenticated
  using (public.is_platform_admin());
-- rate_limits: sin políticas => inaccesible para anon/authenticated.

-- -----------------------------------------------------------------------------
-- Privilegios: se parte de cero y se concede lo mínimo, columna por columna.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.plans, public.platform_settings to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;            -- RLS: solo admin global
grant update (value, is_public) on public.platform_settings to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, marketing_opt_in) on public.profiles to authenticated;

grant select on public.merchants to authenticated;
grant update (name, category, description, logo_url, brand_color, brand_text_color, contact_email, phone,
              website, instagram, address, city, province, onboarding_step, onboarding_data)
  on public.merchants to authenticated;
grant select on public.subscriptions, public.billing_events to authenticated;

grant select on public.branches to authenticated;
grant insert (merchant_id, name, address, phone, active) on public.branches to authenticated;
grant update (name, address, phone, active) on public.branches to authenticated;

grant select on public.memberships, public.membership_branches to authenticated;
grant select (id, merchant_id, email, full_name, role, all_branches, branch_ids, status, invited_by,
              accepted_by, accepted_at, expires_at, created_at) on public.invitations to authenticated;

grant select on public.programs, public.program_versions to authenticated;
grant insert (merchant_id, type, name, description, stamps_required, max_units_per_tx, earn_points, earn_amount,
              max_points_per_tx, max_amount_per_tx, daily_limit_per_card, min_minutes_between, welcome_bonus,
              terms, bg_color, text_color, accent_color, logo_url, stamp_icon, theme, starts_at, ends_at, all_branches,
              join_enabled)
  on public.programs to authenticated;
grant update (name, description, stamps_required, max_units_per_tx, earn_points, earn_amount,
              max_points_per_tx, max_amount_per_tx, daily_limit_per_card, min_minutes_between, welcome_bonus,
              terms, bg_color, text_color, accent_color, logo_url, stamp_icon, theme, starts_at, ends_at, all_branches,
              join_enabled)
  on public.programs to authenticated;
grant select, insert, delete on public.program_branches to authenticated;

grant select on public.rewards to authenticated;
grant insert (merchant_id, program_id, name, description, image_url, cost, terms, valid_from, valid_until,
              stock, max_per_card, status, all_branches, sort_order) on public.rewards to authenticated;
grant update (name, description, image_url, cost, terms, valid_from, valid_until, stock, max_per_card,
              status, all_branches, sort_order) on public.rewards to authenticated;
grant select, insert, delete on public.reward_branches to authenticated;

grant select on public.promotions to authenticated;
grant insert (merchant_id, program_id, title, description, terms, image_url, starts_at, ends_at, status)
  on public.promotions to authenticated;
grant update (program_id, title, description, terms, image_url, starts_at, ends_at, status)
  on public.promotions to authenticated;

grant select on public.cards, public.card_secrets, public.card_transactions, public.redemptions to authenticated;
grant select on public.audit_log, public.support_tickets, public.contact_requests to authenticated;
