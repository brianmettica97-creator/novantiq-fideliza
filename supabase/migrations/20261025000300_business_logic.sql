-- =============================================================================
-- NOVANTIQ Fideliza — Lógica de negocio (RPC). Todas las operaciones sensibles
-- se ejecutan aquí, dentro de una transacción, nunca en el navegador.
--
-- Convención de errores:
--   * Funciones de configuración: lanzan excepción (message = código, detail = texto).
--   * Funciones operativas (sumar, canjear, revertir, ajustar, unirse): devuelven
--     {ok:false, error, message} para que los intentos rechazados queden contados
--     en los límites de frecuencia y registrados en auditoría.
-- =============================================================================

create or replace function public._fail(p_code text, p_message text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'error', p_code, 'message', p_message)
$$;

create or replace function public.mask_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when p_email is null or position('@' in p_email) = 0 then null
              else left(p_email, 1) || '***' || substr(p_email, position('@' in p_email)) end
$$;

create or replace function public.auth_email()
returns text language sql stable security definer set search_path = '' as $$
  select email from auth.users where id = auth.uid()
$$;

create or replace function public.auth_email_confirmed()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
$$;

-- -----------------------------------------------------------------------------
-- Identificadores aleatorios y QR rotativo
-- -----------------------------------------------------------------------------
-- Código legible de 8 caracteres (Crockford base32, 40 bits aleatorios).
create or replace function public.gen_card_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alpha text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end $$;

-- Firma del QR: HMAC-SHA256(secret, token || '.' || paso_de_30s), primeros 16 hex.
-- El navegador del cliente calcula lo mismo (src/lib/qr.ts) sin contactar al servidor.
create or replace function public.qr_signature(p_secret text, p_token text, p_step bigint)
returns text language sql immutable set search_path = '' as $$
  select left(encode(extensions.hmac(p_token || '.' || p_step::text, p_secret, 'sha256'), 'hex'), 16)
$$;

create or replace function public.normalize_card_code(p_ref text)
returns text language sql immutable set search_path = '' as $$
  select translate(upper(regexp_replace(coalesce(p_ref, ''), '[\s-]', '', 'g')), 'OIL', '011')
$$;

-- Resuelve un QR (NF1.token.paso.firma) o un código manual a una tarjeta del comercio.
-- p_max_age_steps: antigüedad máxima aceptada del QR en pasos de 30 segundos.
create or replace function public.resolve_card_ref(p_merchant uuid, p_ref text, p_max_age_steps int)
returns table (card_id uuid, method text) language plpgsql stable security definer set search_path = '' as $$
declare
  v_ref text := btrim(coalesce(p_ref, ''));
  v_parts text[];
  v_step bigint;
  v_now bigint := floor(extract(epoch from now()) / 30)::bigint;
  v_card_id uuid;
  v_secret text;
  v_code text;
begin
  if v_ref ~* '^NF1\.[0-9a-f]{32}\.[0-9]{1,12}\.[0-9a-f]{16}$' then
    v_parts := string_to_array(lower(v_ref), '.');
    v_step := v_parts[3]::bigint;
    select c.id, s.secret into v_card_id, v_secret
      from public.cards c join public.card_secrets s on s.card_id = c.id
     where c.public_token = v_parts[2] and c.merchant_id = p_merchant;
    if v_card_id is null then
      perform public._err('card_not_found', 'La tarjeta no corresponde a este comercio.');
    end if;
    if public.qr_signature(v_secret, v_parts[2], v_step) <> v_parts[4] then
      perform public._err('qr_invalid', 'El código QR no es válido.');
    end if;
    if v_step > v_now + 1 or v_step < v_now - p_max_age_steps then
      perform public._err('qr_expired', 'El código QR venció. Pedile al cliente que abra su tarjeta otra vez.');
    end if;
    return query select v_card_id, 'qr'::text;
    return;
  end if;

  v_code := public.normalize_card_code(v_ref);
  if v_code !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then
    perform public._err('invalid_ref', 'El código ingresado no tiene un formato válido.');
  end if;
  select c.id into v_card_id from public.cards c where c.code = v_code and c.merchant_id = p_merchant;
  if v_card_id is null then
    perform public._err('card_not_found', 'No encontramos una tarjeta con ese código en este comercio.');
  end if;
  return query select v_card_id, 'code'::text;
end $$;

-- -----------------------------------------------------------------------------
-- Reglas reutilizables
-- -----------------------------------------------------------------------------
create or replace function public.assert_program_usable(p_prog public.programs, p_branch uuid, p_for_redeem boolean default false)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_for_redeem then
    if p_prog.status not in ('active','paused') then
      perform public._err('program_inactive', 'El programa no está disponible.');
    end if;
    return;
  end if;
  if p_prog.status <> 'active' then
    perform public._err('program_inactive', 'El programa está pausado o todavía no fue publicado.');
  end if;
  if p_prog.starts_at is not null and p_prog.starts_at > now() then
    perform public._err('program_not_started', 'El programa todavía no comenzó.');
  end if;
  if p_prog.ends_at is not null and p_prog.ends_at < now() then
    perform public._err('program_ended', 'El programa finalizó.');
  end if;
  if not p_prog.all_branches and p_branch is not null and not exists (
       select 1 from public.program_branches pb where pb.program_id = p_prog.id and pb.branch_id = p_branch) then
    perform public._err('branch_not_participating', 'Esta sucursal no participa del programa.');
  end if;
end $$;

-- Devuelve null si la recompensa se puede canjear, o el código del impedimento.
create or replace function public.reward_block_reason(p_card public.cards, p_reward public.rewards, p_prog public.programs, p_branch uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_used int;
begin
  if p_reward.status <> 'active' then return 'reward_inactive'; end if;
  if p_reward.valid_from is not null and p_reward.valid_from > now() then return 'reward_not_started'; end if;
  if p_reward.valid_until is not null and p_reward.valid_until < now() then return 'reward_expired'; end if;
  if p_reward.stock is not null and p_reward.redeemed_count >= p_reward.stock then return 'reward_out_of_stock'; end if;
  if p_branch is not null and not p_reward.all_branches and not exists (
       select 1 from public.reward_branches rb where rb.reward_id = p_reward.id and rb.branch_id = p_branch) then
    return 'reward_branch';
  end if;
  if p_card.balance < p_reward.cost then return 'insufficient_balance'; end if;
  if p_reward.max_per_card is not null then
    select count(*) into v_used from public.redemptions r
     where r.card_id = p_card.id and r.reward_id = p_reward.id and r.status = 'completed';
    if v_used >= p_reward.max_per_card then return 'reward_limit_reached'; end if;
  end if;
  return null;
end $$;

create or replace function public.reward_reason_message(p_code text)
returns text language sql immutable set search_path = '' as $$
  select case p_code
    when 'reward_inactive'      then 'La recompensa no está disponible.'
    when 'reward_not_started'   then 'La recompensa todavía no está vigente.'
    when 'reward_expired'       then 'La recompensa está vencida.'
    when 'reward_out_of_stock'  then 'La recompensa se agotó.'
    when 'reward_branch'        then 'La recompensa no está disponible en esta sucursal.'
    when 'insufficient_balance' then 'El cliente todavía no alcanzó el requisito.'
    when 'reward_limit_reached' then 'El cliente ya utilizó esta recompensa la cantidad máxima de veces.'
    else 'La recompensa no se puede canjear.'
  end
$$;

create or replace function public.card_rewards_json(p_card public.cards, p_branch uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'description', r.description, 'cost', r.cost, 'terms', r.terms,
           'image_url', r.image_url, 'valid_until', r.valid_until,
           'block_reason', public.reward_block_reason(p_card, r, p, p_branch)
         ) order by r.cost, r.sort_order), '[]'::jsonb)
    from public.rewards r join public.programs p on p.id = r.program_id
   where r.program_id = p_card.program_id and r.status = 'active'
$$;

create or replace function public._tx_result(p_tx public.card_transactions, p_duplicate boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ok', true, 'duplicate', p_duplicate, 'transaction_id', p_tx.id, 'type', p_tx.type,
    'units', p_tx.units, 'delta', p_tx.delta, 'balance', c.balance, 'card_id', c.id,
    'program_type', p.type, 'stamps_required', p.stamps_required,
    'rewards_ready', (select count(*) from public.rewards r
                       where r.program_id = p.id and r.status = 'active' and r.cost <= c.balance))
  from public.cards c join public.programs p on p.id = c.program_id
  where c.id = p_tx.card_id
$$;

-- -----------------------------------------------------------------------------
-- Alta de comercio y onboarding
-- -----------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(
           translate(lower(coalesce(p_text, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
           '[^a-z0-9]+', '-', 'g')), 40)
$$;

create or replace function public.create_merchant(p_name text, p_category text default 'otro')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slug text;
  v_base text;
  v_max int := coalesce((public.setting('limits.merchants_per_user'))::text::int, 3);
  v_trial_plan text := coalesce(public.setting('trial.plan_id') #>> '{}', 'inicial');
  v_trial_days int := coalesce((public.setting('trial.days'))::text::int, 14);
  v_count int;
begin
  if v_uid is null then perform public._err('not_authenticated', 'Iniciá sesión para continuar.'); end if;
  if not public.auth_email_confirmed() then
    perform public._err('email_not_confirmed', 'Confirmá tu correo electrónico antes de crear un comercio.');
  end if;
  perform public.hit_rate_limit('create_merchant:' || v_uid, 5, 3600);
  select count(*) into v_count from public.merchants m
    join public.memberships ms on ms.merchant_id = m.id and ms.user_id = v_uid and ms.role = 'owner'
   where m.status <> 'closed';
  if v_count >= v_max then
    perform public._err('limit_reached', format('Podés administrar hasta %s comercios con una misma cuenta.', v_max));
  end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 2 and 80 then
    perform public._err('invalid_name', 'El nombre del comercio debe tener entre 2 y 80 caracteres.');
  end if;

  v_base := public.slugify(p_name);
  if char_length(v_base) < 3 then v_base := 'comercio'; end if;
  v_slug := v_base;
  while exists (select 1 from public.merchants where slug = v_slug) loop
    v_slug := left(v_base, 34) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end loop;

  insert into public.merchants (slug, name, category, contact_email, created_by)
  values (v_slug, p_name, coalesce(p_category, 'otro'), public.auth_email(), v_uid)
  returning id into v_id;
  insert into public.memberships (merchant_id, user_id, role) values (v_id, v_uid, 'owner');
  insert into public.subscriptions (merchant_id, plan_id, status, trial_ends_at, provider)
  values (v_id, v_trial_plan, 'trialing', now() + make_interval(days => v_trial_days), 'manual');
  insert into public.branches (merchant_id, name) values (v_id, 'Principal');
  perform public.log_audit(v_id, 'merchant_created', 'merchants', v_id::text, jsonb_build_object('name', p_name));
  return v_id;
end $$;

create or replace function public.complete_onboarding(p_merchant uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission(p_merchant, 'config') then
    perform public._err('forbidden', 'No tenés permiso para configurar este comercio.');
  end if;
  if not exists (select 1 from public.programs where merchant_id = p_merchant and status = 'active') then
    perform public._err('no_active_program', 'Publicá al menos una tarjeta antes de finalizar.');
  end if;
  update public.merchants set onboarding_step = 6, onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = p_merchant;
end $$;

create or replace function public.my_memberships()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', ms.id, 'merchant_id', m.id, 'name', m.name, 'slug', m.slug, 'logo_url', m.logo_url,
    'brand_color', m.brand_color, 'category', m.category, 'role', ms.role, 'all_branches', ms.all_branches,
    'branch_ids', (select coalesce(jsonb_agg(mb.branch_id), '[]'::jsonb) from public.membership_branches mb where mb.membership_id = ms.id),
    'merchant_status', m.status, 'operational_status', public.merchant_operational_status(m.id),
    'onboarding_step', m.onboarding_step, 'onboarding_completed_at', m.onboarding_completed_at,
    'plan_id', s.plan_id, 'subscription_status', s.status, 'trial_ends_at', s.trial_ends_at,
    'features', p.features
  ) order by m.name), '[]'::jsonb)
  from public.memberships ms
  join public.merchants m on m.id = ms.merchant_id
  left join public.subscriptions s on s.merchant_id = m.id
  left join public.plans p on p.id = s.plan_id
  where ms.user_id = auth.uid() and ms.status = 'active' and m.status <> 'closed'
$$;

-- -----------------------------------------------------------------------------
-- Programas
-- -----------------------------------------------------------------------------
create or replace function public.set_program_status(p_program uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.programs; v_max int; v_active int;
begin
  select * into v_p from public.programs where id = p_program for update;
  if not found or not public.has_permission(v_p.merchant_id, 'config') then
    perform public._err('not_found', 'Programa inexistente o sin permiso.');
  end if;
  if v_p.status = p_status then return; end if;
  if v_p.status = 'archived' then
    perform public._err('archived', 'Un programa archivado no se puede reactivar. Duplicalo para reutilizarlo.');
  end if;
  if p_status not in ('active','paused','archived') or (p_status = 'paused' and v_p.status <> 'active') then
    perform public._err('invalid_transition', 'Cambio de estado no permitido.');
  end if;
  if p_status = 'active' then
    perform public.assert_operational(v_p.merchant_id);
    if not exists (select 1 from public.rewards where program_id = p_program and status = 'active') then
      perform public._err('no_rewards', 'Agregá al menos una recompensa activa antes de publicar.');
    end if;
    if v_p.type = 'points' and not public.plan_has_feature(v_p.merchant_id, 'points') then
      perform public._err('plan_feature', 'Los programas de puntos no están incluidos en tu plan.');
    end if;
    v_max := (public.merchant_plan(v_p.merchant_id)).max_programs;
    select count(*) into v_active from public.programs where merchant_id = v_p.merchant_id and status = 'active';
    if v_max is not null and v_active >= v_max then
      perform public._err('plan_limit', format('Tu plan permite hasta %s programa(s) activo(s).', v_max));
    end if;
  end if;
  update public.programs
     set status = p_status,
         published_at = case when p_status = 'active' then coalesce(published_at, now()) else published_at end,
         archived_at = case when p_status = 'archived' then now() else archived_at end
   where id = p_program;
end $$;

create or replace function public.duplicate_program(p_program uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_p public.programs; v_new uuid; r public.rewards; v_new_reward uuid;
begin
  select * into v_p from public.programs where id = p_program;
  if not found or not public.has_permission(v_p.merchant_id, 'config') then
    perform public._err('not_found', 'Programa inexistente o sin permiso.');
  end if;
  insert into public.programs (merchant_id, type, name, description, stamps_required, max_units_per_tx, earn_points,
    earn_amount, max_points_per_tx, max_amount_per_tx, daily_limit_per_card, min_minutes_between, welcome_bonus,
    terms, bg_color, text_color, accent_color, logo_url, stamp_icon, starts_at, ends_at, all_branches, join_enabled, created_by)
  values (v_p.merchant_id, v_p.type, left(v_p.name || ' (copia)', 60), v_p.description, v_p.stamps_required,
    v_p.max_units_per_tx, v_p.earn_points, v_p.earn_amount, v_p.max_points_per_tx, v_p.max_amount_per_tx,
    v_p.daily_limit_per_card, v_p.min_minutes_between, v_p.welcome_bonus, v_p.terms, v_p.bg_color, v_p.text_color,
    v_p.accent_color, v_p.logo_url, v_p.stamp_icon, v_p.starts_at, v_p.ends_at, v_p.all_branches, v_p.join_enabled, auth.uid())
  returning id into v_new;
  insert into public.program_branches (program_id, branch_id, merchant_id)
    select v_new, branch_id, merchant_id from public.program_branches where program_id = p_program;
  for r in select * from public.rewards where program_id = p_program and status <> 'archived' loop
    insert into public.rewards (merchant_id, program_id, name, description, image_url, cost, terms, valid_from,
      valid_until, stock, max_per_card, status, all_branches, sort_order)
    values (r.merchant_id, v_new, r.name, r.description, r.image_url, r.cost, r.terms, r.valid_from, r.valid_until,
      r.stock, r.max_per_card, r.status, r.all_branches, r.sort_order)
    returning id into v_new_reward;
    insert into public.reward_branches (reward_id, branch_id, merchant_id)
      select v_new_reward, branch_id, merchant_id from public.reward_branches where reward_id = r.id;
  end loop;
  return v_new;
end $$;

-- Información pública de un programa (para la página de inscripción). No expone datos privados.
create or replace function public.get_public_program(p_join_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_p public.programs; v_m public.merchants;
begin
  select * into v_p from public.programs where join_code = p_join_code;
  if not found or v_p.status = 'archived' or (v_p.status = 'draft' and not public.is_member(v_p.merchant_id)) then
    return null;
  end if;
  select * into v_m from public.merchants where id = v_p.merchant_id;
  if v_m.status = 'closed' then return null; end if;
  return jsonb_build_object(
    'program', jsonb_build_object('id', v_p.id, 'type', v_p.type, 'name', v_p.name, 'description', v_p.description,
      'status', v_p.status, 'stamps_required', v_p.stamps_required, 'earn_points', v_p.earn_points,
      'earn_amount', v_p.earn_amount, 'welcome_bonus', v_p.welcome_bonus, 'terms', v_p.terms,
      'bg_color', v_p.bg_color, 'text_color', v_p.text_color, 'accent_color', v_p.accent_color,
      'logo_url', coalesce(v_p.logo_url, v_m.logo_url), 'stamp_icon', v_p.stamp_icon,
      'starts_at', v_p.starts_at, 'ends_at', v_p.ends_at, 'join_code', v_p.join_code),
    'merchant', jsonb_build_object('name', v_m.name, 'slug', v_m.slug, 'category', v_m.category,
      'description', v_m.description, 'logo_url', v_m.logo_url, 'brand_color', v_m.brand_color,
      'address', v_m.address, 'city', v_m.city, 'instagram', v_m.instagram, 'website', v_m.website),
    'rewards', (select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'description', r.description,
                  'cost', r.cost, 'terms', r.terms, 'valid_until', r.valid_until) order by r.cost), '[]'::jsonb)
                from public.rewards r where r.program_id = v_p.id and r.status = 'active'),
    'promotions', (select coalesce(jsonb_agg(jsonb_build_object('title', pr.title, 'description', pr.description,
                  'terms', pr.terms, 'ends_at', pr.ends_at)), '[]'::jsonb)
                from public.promotions pr
                where pr.merchant_id = v_m.id and pr.status = 'active'
                  and (pr.program_id is null or pr.program_id = v_p.id)
                  and (pr.starts_at is null or pr.starts_at <= now()) and (pr.ends_at is null or pr.ends_at > now())),
    'joinable', v_p.status = 'active' and v_p.join_enabled
                and (v_p.ends_at is null or v_p.ends_at > now())
                and public.merchant_operational_status(v_m.id) = 'ok',
    'already_member', exists (select 1 from public.cards c where c.program_id = v_p.id and c.customer_id = auth.uid())
  );
end $$;

-- -----------------------------------------------------------------------------
-- Cliente final
-- -----------------------------------------------------------------------------
create or replace function public.join_program(p_join_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p public.programs; v_card public.cards; v_max int; v_count int; v_code text; v_detail text;
begin
  if v_uid is null then return public._fail('not_authenticated', 'Iniciá sesión para sumarte.'); end if;
  begin
    perform public.hit_rate_limit('join:' || v_uid, 20, 3600);
  exception when sqlstate 'P0001' then
    return public._fail('rate_limited', 'Demasiados intentos. Probá más tarde.');
  end;
  begin
    select * into v_p from public.programs where join_code = p_join_code;
    if not found or v_p.status <> 'active' or not v_p.join_enabled then
      perform public._err('program_unavailable', 'Este programa no está disponible para nuevas inscripciones.');
    end if;
    perform public.assert_program_usable(v_p, null);
    perform public.assert_operational(v_p.merchant_id);

    select * into v_card from public.cards where program_id = v_p.id and customer_id = v_uid for update;
    if found then
      if v_card.status = 'blocked' then
        perform public._err('card_blocked', 'Tu tarjeta está bloqueada. Consultá con el comercio.');
      end if;
      if v_card.status = 'closed' then
        update public.cards set status = 'active', status_reason = null where id = v_card.id;
      end if;
      return jsonb_build_object('ok', true, 'card_id', v_card.id, 'existing', true);
    end if;

    v_max := (public.merchant_plan(v_p.merchant_id)).max_cards;
    if v_max is not null then
      select count(*) into v_count from public.cards where merchant_id = v_p.merchant_id and status <> 'closed';
      if v_count >= v_max then
        perform public._err('merchant_capacity', 'El comercio alcanzó el límite de clientes de su plan. Avisale al personal.');
      end if;
    end if;

    loop
      begin
        insert into public.cards (merchant_id, program_id, customer_id, code, public_token, balance, lifetime_earned)
        values (v_p.merchant_id, v_p.id, v_uid, public.gen_card_code(),
                encode(extensions.gen_random_bytes(16), 'hex'), v_p.welcome_bonus, v_p.welcome_bonus)
        returning * into v_card;
        exit;
      exception when unique_violation then
        if exists (select 1 from public.cards where program_id = v_p.id and customer_id = v_uid) then
          select * into v_card from public.cards where program_id = v_p.id and customer_id = v_uid;
          return jsonb_build_object('ok', true, 'card_id', v_card.id, 'existing', true);
        end if;
        -- colisión de código aleatorio: se reintenta
      end;
    end loop;
    insert into public.card_secrets (card_id, secret) values (v_card.id, encode(extensions.gen_random_bytes(32), 'hex'));
    if v_p.welcome_bonus > 0 then
      insert into public.card_transactions (merchant_id, card_id, program_id, program_version, type, delta, units,
        reason, lookup_method, balance_after)
      values (v_p.merchant_id, v_card.id, v_p.id, v_p.version, 'welcome', v_p.welcome_bonus, v_p.welcome_bonus,
        'Beneficio de bienvenida', 'self', v_card.balance);
    end if;
    return jsonb_build_object('ok', true, 'card_id', v_card.id, 'existing', false);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    return public._fail(v_code, v_detail);
  end;
end $$;

create or replace function public.get_my_wallet()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'card_id', c.id, 'code', c.code, 'status', c.status, 'balance', c.balance,
    'lifetime_earned', c.lifetime_earned, 'last_activity_at', c.last_activity_at, 'created_at', c.created_at,
    'program', jsonb_build_object('id', p.id, 'type', p.type, 'name', p.name, 'status', p.status,
      'stamps_required', p.stamps_required, 'bg_color', p.bg_color, 'text_color', p.text_color,
      'accent_color', p.accent_color, 'logo_url', coalesce(p.logo_url, m.logo_url), 'stamp_icon', p.stamp_icon),
    'merchant', jsonb_build_object('name', m.name, 'logo_url', m.logo_url, 'category', m.category),
    'rewards_ready', (select count(*) from public.rewards r where r.program_id = p.id and r.status = 'active'
                       and public.reward_block_reason(c, r, p, null) is null)
  ) order by c.last_activity_at desc nulls last, c.created_at desc), '[]'::jsonb)
  from public.cards c
  join public.programs p on p.id = c.program_id
  join public.merchants m on m.id = c.merchant_id
  where c.customer_id = auth.uid() and c.status <> 'closed'
$$;

create or replace function public.get_my_card(p_card uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_c public.cards; v_p public.programs; v_m public.merchants;
begin
  select * into v_c from public.cards where id = p_card and customer_id = auth.uid();
  if not found then return null; end if;
  select * into v_p from public.programs where id = v_c.program_id;
  select * into v_m from public.merchants where id = v_c.merchant_id;
  return jsonb_build_object(
    'card', jsonb_build_object('id', v_c.id, 'code', v_c.code, 'status', v_c.status, 'balance', v_c.balance,
      'lifetime_earned', v_c.lifetime_earned, 'lifetime_redeemed', v_c.lifetime_redeemed,
      'public_token', v_c.public_token, 'created_at', v_c.created_at, 'last_activity_at', v_c.last_activity_at),
    'secret', (select secret from public.card_secrets where card_id = v_c.id),
    'program', jsonb_build_object('id', v_p.id, 'type', v_p.type, 'name', v_p.name, 'description', v_p.description,
      'status', v_p.status, 'stamps_required', v_p.stamps_required, 'earn_points', v_p.earn_points,
      'earn_amount', v_p.earn_amount, 'terms', v_p.terms, 'bg_color', v_p.bg_color, 'text_color', v_p.text_color,
      'accent_color', v_p.accent_color, 'logo_url', coalesce(v_p.logo_url, v_m.logo_url), 'stamp_icon', v_p.stamp_icon,
      'ends_at', v_p.ends_at),
    'merchant', jsonb_build_object('name', v_m.name, 'logo_url', v_m.logo_url, 'address', v_m.address,
      'city', v_m.city, 'phone', v_m.phone, 'instagram', v_m.instagram, 'website', v_m.website),
    'rewards', public.card_rewards_json(v_c, null),
    'promotions', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'title', pr.title,
                  'description', pr.description, 'terms', pr.terms, 'ends_at', pr.ends_at)), '[]'::jsonb)
                from public.promotions pr
                where pr.merchant_id = v_m.id and pr.status = 'active'
                  and (pr.program_id is null or pr.program_id = v_p.id)
                  and (pr.starts_at is null or pr.starts_at <= now()) and (pr.ends_at is null or pr.ends_at > now())),
    'history', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
                  select t.id, t.type, t.delta, t.units, t.status, t.created_at, r.name as reward_name, b.name as branch_name
                    from public.card_transactions t
                    left join public.rewards r on r.id = t.reward_id
                    left join public.branches b on b.id = t.branch_id
                   where t.card_id = v_c.id order by t.created_at desc limit 50) x)
  );
end $$;

create or replace function public.leave_program(p_card uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.cards set status = 'closed', status_reason = 'Baja solicitada por el cliente'
   where id = p_card and customer_id = auth.uid() and status = 'active';
  if not found then perform public._err('not_found', 'Tarjeta inexistente.'); end if;
end $$;

-- Derecho de acceso (Ley 25.326): exporta los datos personales del usuario actual.
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('merchant', m.name, 'program', pr.name, 'code', c.code,
               'balance', c.balance, 'status', c.status, 'created_at', c.created_at,
               'transactions', (select coalesce(jsonb_agg(jsonb_build_object('type', t.type, 'delta', t.delta,
                                  'created_at', t.created_at)), '[]'::jsonb)
                                from public.card_transactions t where t.card_id = c.id))), '[]'::jsonb)
              from public.cards c join public.merchants m on m.id = c.merchant_id
              join public.programs pr on pr.id = c.program_id where c.customer_id = auth.uid()),
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object('merchant', m.name, 'role', ms.role)), '[]'::jsonb)
                    from public.memberships ms join public.merchants m on m.id = ms.merchant_id
                    where ms.user_id = auth.uid()),
    'exported_at', now())
$$;

-- -----------------------------------------------------------------------------
-- Operación en mostrador
-- -----------------------------------------------------------------------------
create or replace function public.staff_lookup_card(p_merchant uuid, p_branch uuid, p_card_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_card_id uuid; v_method text; v_c public.cards; v_p public.programs;
  v_code text; v_detail text; v_role text;
begin
  if v_uid is null then return public._fail('not_authenticated', 'Iniciá sesión para continuar.'); end if;
  v_role := public.current_role_in(p_merchant);
  if v_role is null or not public.role_has_permission(v_role, 'operate') then
    return public._fail('forbidden', 'No tenés permiso para operar en este comercio.');
  end if;
  begin
    perform public.hit_rate_limit('lookup:' || v_uid, public.setting_int('limits.lookups_per_minute', 60), 60);
  exception when sqlstate 'P0001' then
    return public._fail('rate_limited', 'Demasiadas búsquedas seguidas. Esperá un minuto.');
  end;
  begin
    select r.card_id, r.method into v_card_id, v_method from public.resolve_card_ref(p_merchant, p_card_ref, 4) r;
    select * into v_c from public.cards where id = v_card_id;
    select * into v_p from public.programs where id = v_c.program_id;
    return jsonb_build_object(
      'ok', true, 'method', v_method,
      'card', jsonb_build_object('id', v_c.id, 'code', v_c.code, 'status', v_c.status, 'balance', v_c.balance,
        'lifetime_earned', v_c.lifetime_earned, 'created_at', v_c.created_at, 'last_activity_at', v_c.last_activity_at),
      'customer', (select jsonb_build_object('name', nullif(pf.full_name, ''),
                     'email', case when v_role = 'staff' then public.mask_email(pf.email) else pf.email end)
                   from public.profiles pf where pf.id = v_c.customer_id),
      'program', jsonb_build_object('id', v_p.id, 'type', v_p.type, 'name', v_p.name, 'status', v_p.status,
        'stamps_required', v_p.stamps_required, 'max_units_per_tx', v_p.max_units_per_tx,
        'earn_points', v_p.earn_points, 'earn_amount', v_p.earn_amount, 'max_amount_per_tx', v_p.max_amount_per_tx,
        'bg_color', v_p.bg_color, 'text_color', v_p.text_color, 'accent_color', v_p.accent_color, 'stamp_icon', v_p.stamp_icon),
      'rewards', public.card_rewards_json(v_c, p_branch),
      'recent', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
                   select t.id, t.type, t.delta, t.units, t.status, t.created_at from public.card_transactions t
                    where t.card_id = v_c.id order by t.created_at desc limit 5) x));
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    if v_code in ('qr_invalid','card_not_found') then
      perform public.log_audit(p_merchant, 'operation_rejected', 'cards', null,
        jsonb_build_object('operation', 'lookup', 'reason', v_code, 'branch_id', p_branch));
    end if;
    return public._fail(v_code, v_detail);
  end;
end $$;

create or replace function public.record_earn(
  p_merchant uuid, p_branch uuid, p_card_ref text, p_units int default 1,
  p_amount numeric default null, p_idempotency_key text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_card_id uuid; v_method text; v_c public.cards; v_p public.programs; v_tx public.card_transactions;
  v_units int; v_tz text; v_day_start timestamptz; v_count int; v_code text; v_detail text;
begin
  if v_uid is null then return public._fail('not_authenticated', 'Iniciá sesión para continuar.'); end if;
  if not public.has_permission(p_merchant, 'operate') then
    return public._fail('forbidden', 'No tenés permiso para registrar operaciones en este comercio.');
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    return public._fail('invalid_request', 'Solicitud inválida: falta la clave de operación.');
  end if;
  select * into v_tx from public.card_transactions where merchant_id = p_merchant and idempotency_key = p_idempotency_key;
  if found then return public._tx_result(v_tx, true); end if;
  begin
    perform public.hit_rate_limit('op:' || v_uid, public.setting_int('limits.ops_per_minute', 30), 60);
  exception when sqlstate 'P0001' then
    return public._fail('rate_limited', 'Demasiadas operaciones seguidas. Esperá un minuto.');
  end;

  begin
    perform public.assert_operational(p_merchant);
    if p_branch is null or not public.can_operate_branch(p_merchant, p_branch) then
      perform public._err('branch_forbidden', 'No estás habilitado para operar en esta sucursal.');
    end if;
    -- El QR se acepta hasta 10 minutos después de escaneado (tiempo para confirmar).
    select r.card_id, r.method into v_card_id, v_method from public.resolve_card_ref(p_merchant, p_card_ref, 20) r;
    select * into v_c from public.cards where id = v_card_id for update;

    -- Revalidación de idempotencia ya con la fila bloqueada (solicitudes simultáneas).
    select * into v_tx from public.card_transactions where merchant_id = p_merchant and idempotency_key = p_idempotency_key;
    if found then return public._tx_result(v_tx, true); end if;

    if v_c.status <> 'active' then
      perform public._err('card_blocked', 'Esta tarjeta está bloqueada o dada de baja.');
    end if;
    select * into v_p from public.programs where id = v_c.program_id;
    perform public.assert_program_usable(v_p, p_branch);

    if v_p.type = 'points' then
      if p_amount is null or p_amount <= 0 or p_amount > 100000000 then
        perform public._err('invalid_amount', 'Ingresá un importe de compra válido.');
      end if;
      if v_p.max_amount_per_tx is not null and p_amount > v_p.max_amount_per_tx then
        perform public._err('amount_limit', format('El importe máximo por operación es $%s.', v_p.max_amount_per_tx));
      end if;
      v_units := (floor(p_amount / v_p.earn_amount) * v_p.earn_points)::int;
      if v_p.max_points_per_tx is not null then v_units := least(v_units, v_p.max_points_per_tx); end if;
      if v_units < 1 then
        perform public._err('amount_too_low', format('El importe no alcanza para sumar puntos (mínimo $%s).', v_p.earn_amount));
      end if;
    elsif v_p.type = 'stamps' then
      v_units := coalesce(p_units, 1);
      if v_units < 1 or v_units > v_p.max_units_per_tx then
        perform public._err('invalid_units', format('Podés sumar entre 1 y %s sello(s) por operación.', v_p.max_units_per_tx));
      end if;
    else
      v_units := 1;
    end if;

    if v_p.min_minutes_between > 0 and exists (
         select 1 from public.card_transactions t
          where t.card_id = v_c.id and t.type = 'earn' and t.status = 'completed'
            and t.created_at > now() - make_interval(mins => v_p.min_minutes_between)) then
      perform public._err('cooldown', format('Esta tarjeta ya sumó hace menos de %s minuto(s).', v_p.min_minutes_between));
    end if;
    select timezone into v_tz from public.merchants where id = p_merchant;
    v_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
    select count(*) into v_count from public.card_transactions t
     where t.card_id = v_c.id and t.type = 'earn' and t.status = 'completed' and t.created_at >= v_day_start;
    if v_count >= v_p.daily_limit_per_card then
      perform public._err('daily_limit', format('Esta tarjeta alcanzó el máximo de %s operación(es) por día.', v_p.daily_limit_per_card));
    end if;

    update public.cards set balance = balance + v_units, lifetime_earned = lifetime_earned + v_units,
                            last_activity_at = now()
     where id = v_c.id returning * into v_c;
    insert into public.card_transactions (merchant_id, card_id, program_id, program_version, type, delta, units,
      purchase_amount, reason, performed_by, branch_id, lookup_method, idempotency_key, balance_after)
    values (p_merchant, v_c.id, v_p.id, v_p.version, 'earn', v_units, v_units, p_amount, left(p_note, 300),
      v_uid, p_branch, v_method, p_idempotency_key, v_c.balance)
    returning * into v_tx;
    return public._tx_result(v_tx, false);
  exception
    when unique_violation then
      return public._fail('duplicate', 'La operación ya fue registrada.');
    when sqlstate 'P0001' then
      get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
      if v_code in ('qr_invalid','qr_expired','card_not_found','cooldown','daily_limit','card_blocked') then
        perform public.log_audit(p_merchant, 'operation_rejected', 'cards', v_card_id::text,
          jsonb_build_object('operation', 'earn', 'reason', v_code, 'branch_id', p_branch));
      end if;
      return public._fail(v_code, v_detail);
  end;
end $$;

create or replace function public.redeem_reward(
  p_merchant uuid, p_branch uuid, p_card_ref text, p_reward uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_card_id uuid; v_method text; v_c public.cards; v_p public.programs; v_r public.rewards;
  v_tx public.card_transactions; v_reason text; v_delta int; v_redemption uuid; v_code text; v_detail text;
begin
  if v_uid is null then return public._fail('not_authenticated', 'Iniciá sesión para continuar.'); end if;
  if not public.has_permission(p_merchant, 'operate') then
    return public._fail('forbidden', 'No tenés permiso para registrar canjes en este comercio.');
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    return public._fail('invalid_request', 'Solicitud inválida: falta la clave de operación.');
  end if;
  select * into v_tx from public.card_transactions where merchant_id = p_merchant and idempotency_key = p_idempotency_key;
  if found then return public._tx_result(v_tx, true) || jsonb_build_object('redemption_id', v_tx.redemption_id); end if;
  begin
    perform public.hit_rate_limit('op:' || v_uid, public.setting_int('limits.ops_per_minute', 30), 60);
  exception when sqlstate 'P0001' then
    return public._fail('rate_limited', 'Demasiadas operaciones seguidas. Esperá un minuto.');
  end;

  begin
    perform public.assert_operational(p_merchant);
    if p_branch is null or not public.can_operate_branch(p_merchant, p_branch) then
      perform public._err('branch_forbidden', 'No estás habilitado para operar en esta sucursal.');
    end if;
    select r.card_id, r.method into v_card_id, v_method from public.resolve_card_ref(p_merchant, p_card_ref, 20) r;
    select * into v_c from public.cards where id = v_card_id for update;
    select * into v_tx from public.card_transactions where merchant_id = p_merchant and idempotency_key = p_idempotency_key;
    if found then return public._tx_result(v_tx, true) || jsonb_build_object('redemption_id', v_tx.redemption_id); end if;
    if v_c.status <> 'active' then
      perform public._err('card_blocked', 'Esta tarjeta está bloqueada o dada de baja.');
    end if;
    select * into v_p from public.programs where id = v_c.program_id;
    perform public.assert_program_usable(v_p, p_branch, true);

    select * into v_r from public.rewards
     where id = p_reward and merchant_id = p_merchant and program_id = v_c.program_id for update;
    if not found then perform public._err('reward_not_found', 'La recompensa no corresponde a esta tarjeta.'); end if;
    v_reason := public.reward_block_reason(v_c, v_r, v_p, p_branch);
    if v_reason is not null then perform public._err(v_reason, public.reward_reason_message(v_reason)); end if;

    -- En hitos la recompensa no consume saldo (el contador es acumulativo).
    v_delta := case when v_p.type = 'milestones' then 0 else -v_r.cost end;
    update public.cards set balance = balance + v_delta, lifetime_redeemed = lifetime_redeemed - v_delta,
                            last_activity_at = now()
     where id = v_c.id returning * into v_c;
    insert into public.card_transactions (merchant_id, card_id, program_id, program_version, type, delta, units,
      reason, reward_id, performed_by, branch_id, lookup_method, idempotency_key, balance_after)
    values (p_merchant, v_c.id, v_p.id, v_p.version, 'redeem', v_delta, v_r.cost, 'Canje: ' || v_r.name, v_r.id,
      v_uid, p_branch, v_method, p_idempotency_key, v_c.balance)
    returning * into v_tx;
    insert into public.redemptions (merchant_id, card_id, reward_id, transaction_id, cost, performed_by, branch_id)
    values (p_merchant, v_c.id, v_r.id, v_tx.id, v_r.cost, v_uid, p_branch)
    returning id into v_redemption;
    update public.card_transactions set redemption_id = v_redemption where id = v_tx.id returning * into v_tx;
    update public.rewards set redeemed_count = redeemed_count + 1 where id = v_r.id;
    return public._tx_result(v_tx, false) || jsonb_build_object('redemption_id', v_redemption, 'reward_name', v_r.name);
  exception
    when unique_violation then
      return public._fail('duplicate', 'La operación ya fue registrada.');
    when sqlstate 'P0001' then
      get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
      if v_code in ('qr_invalid','qr_expired','card_not_found','card_blocked') then
        perform public.log_audit(p_merchant, 'operation_rejected', 'cards', v_card_id::text,
          jsonb_build_object('operation', 'redeem', 'reason', v_code, 'branch_id', p_branch));
      end if;
      return public._fail(v_code, v_detail);
  end;
end $$;

-- Corrección auditable: genera un movimiento compensatorio, nunca borra el original.
create or replace function public.reverse_transaction(p_transaction uuid, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tx public.card_transactions; v_c public.cards; v_red public.redemptions; v_rev public.card_transactions;
  v_delta int; v_code text; v_detail text;
begin
  if v_uid is null then return public._fail('not_authenticated', 'Iniciá sesión para continuar.'); end if;
  select * into v_tx from public.card_transactions where id = p_transaction;
  if not found or not public.is_member(v_tx.merchant_id) then
    return public._fail('not_found', 'Movimiento inexistente.');
  end if;
  if not public.has_permission(v_tx.merchant_id, 'adjust') then
    return public._fail('forbidden', 'Solo propietarios, administradores o encargados pueden anular movimientos.');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    return public._fail('reason_required', 'Indicá el motivo de la anulación.');
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    return public._fail('invalid_request', 'Solicitud inválida: falta la clave de operación.');
  end if;
  begin
    select * into v_rev from public.card_transactions where merchant_id = v_tx.merchant_id and idempotency_key = p_idempotency_key;
    if found then return public._tx_result(v_rev, true); end if;
    select * into v_c from public.cards where id = v_tx.card_id for update;
    select * into v_tx from public.card_transactions where id = p_transaction for update;
    if v_tx.type = 'reversal' then perform public._err('invalid', 'Una anulación no se puede anular.'); end if;
    if v_tx.status = 'reversed' then perform public._err('already_reversed', 'Este movimiento ya fue anulado.'); end if;

    v_delta := -v_tx.delta;
    if v_tx.type = 'redeem' then
      select * into v_red from public.redemptions where id = v_tx.redemption_id for update;
      if not found or v_red.status <> 'completed' then
        perform public._err('already_cancelled', 'El canje ya estaba cancelado.');
      end if;
    elsif v_c.balance + v_delta < 0 then
      perform public._err('insufficient_balance',
        'El cliente ya utilizó ese saldo. Anulá primero el canje correspondiente o registrá un ajuste.');
    end if;

    update public.cards
       set balance = balance + v_delta,
           lifetime_earned = case when v_tx.type in ('earn','welcome') then greatest(0, lifetime_earned - v_tx.units)
                                  else lifetime_earned end,
           lifetime_redeemed = case when v_tx.type = 'redeem' then greatest(0, lifetime_redeemed - v_delta)
                                    else lifetime_redeemed end
     where id = v_c.id returning * into v_c;
    insert into public.card_transactions (merchant_id, card_id, program_id, program_version, type, delta, units,
      reason, reward_id, redemption_id, reverses_id, performed_by, branch_id, lookup_method, idempotency_key, balance_after)
    values (v_tx.merchant_id, v_c.id, v_tx.program_id, v_tx.program_version, 'reversal', v_delta, v_tx.units,
      left(btrim(p_reason), 300), v_tx.reward_id, v_tx.redemption_id, v_tx.id, v_uid, v_tx.branch_id, 'system',
      p_idempotency_key, v_c.balance)
    returning * into v_rev;
    update public.card_transactions set status = 'reversed' where id = v_tx.id;
    if v_tx.type = 'redeem' then
      update public.redemptions set status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(),
             cancel_reason = left(btrim(p_reason), 300), cancel_transaction_id = v_rev.id
       where id = v_red.id;
      update public.rewards set redeemed_count = greatest(0, redeemed_count - 1) where id = v_red.reward_id;
    end if;
    perform public.log_audit(v_tx.merchant_id, 'transaction_reversed', 'card_transactions', v_tx.id::text,
      jsonb_build_object('reversal_id', v_rev.id, 'type', v_tx.type, 'delta', v_delta, 'reason', p_reason));
    return public._tx_result(v_rev, false);
  exception
    when unique_violation then
      return public._fail('duplicate', 'La anulación ya fue registrada.');
    when sqlstate 'P0001' then
      get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
      return public._fail(v_code, v_detail);
  end;
end $$;

create or replace function public.adjust_balance(p_merchant uuid, p_card uuid, p_delta int, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_c public.cards; v_p public.programs; v_tx public.card_transactions;
  v_code text; v_detail text;
begin
  if v_uid is null then return public._fail('not_authenticated', 'Iniciá sesión para continuar.'); end if;
  if not public.has_permission(p_merchant, 'adjust') then
    return public._fail('forbidden', 'No tenés permiso para ajustar saldos.');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    return public._fail('reason_required', 'Indicá el motivo del ajuste.');
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    return public._fail('invalid_request', 'Solicitud inválida: falta la clave de operación.');
  end if;
  begin
    perform public.assert_operational(p_merchant);
    select * into v_c from public.cards where id = p_card and merchant_id = p_merchant for update;
    if not found then perform public._err('card_not_found', 'Tarjeta inexistente.'); end if;
    select * into v_tx from public.card_transactions where merchant_id = p_merchant and idempotency_key = p_idempotency_key;
    if found then return public._tx_result(v_tx, true); end if;
    select * into v_p from public.programs where id = v_c.program_id;
    if p_delta is null or p_delta = 0
       or abs(p_delta) > (case when v_p.type = 'points' then 100000 else coalesce(v_p.stamps_required, 50) end) then
      perform public._err('invalid_amount', 'La cantidad del ajuste no es válida.');
    end if;
    if v_c.balance + p_delta < 0 then
      perform public._err('insufficient_balance', 'El ajuste dejaría el saldo en negativo.');
    end if;
    update public.cards set balance = balance + p_delta,
           lifetime_earned = case when p_delta > 0 then lifetime_earned + p_delta else lifetime_earned end,
           last_activity_at = now()
     where id = v_c.id returning * into v_c;
    insert into public.card_transactions (merchant_id, card_id, program_id, program_version, type, delta, units,
      reason, performed_by, lookup_method, idempotency_key, balance_after)
    values (p_merchant, v_c.id, v_p.id, v_p.version, 'adjust', p_delta, abs(p_delta), left(btrim(p_reason), 300),
      v_uid, 'system', p_idempotency_key, v_c.balance)
    returning * into v_tx;
    perform public.log_audit(p_merchant, 'balance_adjusted', 'cards', v_c.id::text,
      jsonb_build_object('delta', p_delta, 'reason', p_reason, 'transaction_id', v_tx.id));
    return public._tx_result(v_tx, false);
  exception
    when unique_violation then
      return public._fail('duplicate', 'El ajuste ya fue registrado.');
    when sqlstate 'P0001' then
      get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
      return public._fail(v_code, v_detail);
  end;
end $$;

create or replace function public.set_card_status(p_card uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_c public.cards;
begin
  select * into v_c from public.cards where id = p_card for update;
  if not found or not public.has_permission(v_c.merchant_id, 'adjust') then
    perform public._err('not_found', 'Tarjeta inexistente o sin permiso.');
  end if;
  if p_status not in ('active','blocked') then perform public._err('invalid', 'Estado inválido.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform public._err('reason_required', 'Indicá el motivo.'); end if;
  update public.cards set status = p_status, status_reason = left(btrim(p_reason), 300) where id = p_card;
  perform public.log_audit(v_c.merchant_id, 'card_status_changed', 'cards', p_card::text,
    jsonb_build_object('from', v_c.status, 'to', p_status, 'reason', p_reason));
end $$;

-- -----------------------------------------------------------------------------
-- Consultas del panel del comercio
-- -----------------------------------------------------------------------------
create or replace function public.search_customers(p_merchant uuid, p_query text default null, p_program uuid default null,
  p_limit int default 25, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := public.current_role_in(p_merchant); v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if v_role is null or not public.role_has_permission(v_role, 'customers.view') then
    perform public._err('forbidden', 'No tenés permiso para ver clientes.');
  end if;
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 500);
  return (
    with base as (
      select c.id, c.code, c.status, c.balance, c.lifetime_earned, c.created_at, c.last_activity_at,
             p.id as program_id, p.name as program_name, p.type as program_type, p.stamps_required,
             pf.full_name, pf.email, pf.phone
        from public.cards c
        join public.programs p on p.id = c.program_id
        left join public.profiles pf on pf.id = c.customer_id
       where c.merchant_id = p_merchant
         and (p_program is null or c.program_id = p_program)
         and (v_q is null or pf.full_name ilike '%' || v_q || '%' or pf.email ilike '%' || v_q || '%'
              or c.code = public.normalize_card_code(v_q))
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'card_id', b.id, 'code', b.code, 'status', b.status, 'balance', b.balance,
          'lifetime_earned', b.lifetime_earned, 'created_at', b.created_at, 'last_activity_at', b.last_activity_at,
          'program_id', b.program_id, 'program_name', b.program_name, 'program_type', b.program_type,
          'stamps_required', b.stamps_required, 'name', nullif(b.full_name, ''),
          'email', case when v_role = 'staff' then public.mask_email(b.email) else b.email end,
          'phone', case when v_role = 'staff' then null else b.phone end))
        from (select * from base order by last_activity_at desc nulls last, created_at desc
              limit p_limit offset greatest(coalesce(p_offset, 0), 0)) b), '[]'::jsonb))
  );
end $$;

create or replace function public.get_card_detail(p_merchant uuid, p_card uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text := public.current_role_in(p_merchant); v_c public.cards; v_p public.programs;
begin
  if v_role is null or not public.role_has_permission(v_role, 'customers.view') then
    perform public._err('forbidden', 'No tenés permiso para ver clientes.');
  end if;
  select * into v_c from public.cards where id = p_card and merchant_id = p_merchant;
  if not found then return null; end if;
  select * into v_p from public.programs where id = v_c.program_id;
  return jsonb_build_object(
    'card', to_jsonb(v_c) - 'public_token',
    'program', to_jsonb(v_p),
    'customer', (select jsonb_build_object('name', nullif(pf.full_name, ''),
                   'email', case when v_role = 'staff' then public.mask_email(pf.email) else pf.email end,
                   'phone', case when v_role = 'staff' then null else pf.phone end)
                 from public.profiles pf where pf.id = v_c.customer_id),
    'rewards', public.card_rewards_json(v_c, null),
    'transactions', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select t.id, t.type, t.delta, t.units, t.status, t.reason, t.purchase_amount, t.lookup_method,
               t.created_at, t.reverses_id, t.program_version, b.name as branch_name, r.name as reward_name,
               nullif(pf.full_name, '') as staff_name
          from public.card_transactions t
          left join public.branches b on b.id = t.branch_id
          left join public.rewards r on r.id = t.reward_id
          left join public.profiles pf on pf.id = t.performed_by
         where t.card_id = v_c.id order by t.created_at desc limit 100) x)
  );
end $$;

create or replace function public.list_transactions(p_merchant uuid, p_type text default null, p_branch uuid default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_merchant, 'stats') then
    perform public._err('forbidden', 'No tenés permiso para ver los movimientos.');
  end if;
  p_limit := least(greatest(coalesce(p_limit, 50), 1), 1000);
  return (
    with base as (
      select t.*, c.code as card_code, p.name as program_name, b.name as branch_name, r.name as reward_name,
             nullif(cu.full_name, '') as customer_name, nullif(st.full_name, '') as staff_name, st.email as staff_email
        from public.card_transactions t
        join public.cards c on c.id = t.card_id
        join public.programs p on p.id = t.program_id
        left join public.branches b on b.id = t.branch_id
        left join public.rewards r on r.id = t.reward_id
        left join public.profiles cu on cu.id = c.customer_id
        left join public.profiles st on st.id = t.performed_by
       where t.merchant_id = p_merchant
         and (p_type is null or t.type = p_type)
         and (p_branch is null or t.branch_id = p_branch)
         and (p_from is null or t.created_at >= p_from)
         and (p_to is null or t.created_at < p_to)
    )
    select jsonb_build_object('total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'type', x.type, 'delta', x.delta, 'units', x.units, 'status', x.status, 'reason', x.reason,
          'purchase_amount', x.purchase_amount, 'lookup_method', x.lookup_method, 'created_at', x.created_at,
          'card_id', x.card_id, 'card_code', x.card_code, 'program_name', x.program_name,
          'branch_name', x.branch_name, 'reward_name', x.reward_name, 'customer_name', x.customer_name,
          'staff_name', coalesce(x.staff_name, x.staff_email), 'reverses_id', x.reverses_id) order by x.created_at desc)
        from (select * from base order by created_at desc limit p_limit offset greatest(coalesce(p_offset, 0), 0)) x),
        '[]'::jsonb))
  );
end $$;

create or replace function public.merchant_dashboard(p_merchant uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365); v_from timestamptz; v_tz text;
begin
  if not public.has_permission(p_merchant, 'stats') then
    perform public._err('forbidden', 'No tenés permiso para ver estadísticas.');
  end if;
  select timezone into v_tz from public.merchants where id = p_merchant;
  v_from := (date_trunc('day', now() at time zone v_tz) - make_interval(days => v_days - 1)) at time zone v_tz;
  return (
    with t as (
      select tx.*, c.customer_id from public.card_transactions tx join public.cards c on c.id = tx.card_id
       where tx.merchant_id = p_merchant and tx.created_at >= v_from and tx.status = 'completed'
    ), earn as (select * from t where type = 'earn'),
    per_customer as (select customer_id, count(*) n from earn group by customer_id)
    select jsonb_build_object(
      'days', v_days,
      'customers_total', (select count(distinct customer_id) from public.cards where merchant_id = p_merchant),
      'customers_new', (select count(distinct customer_id) from public.cards where merchant_id = p_merchant and created_at >= v_from),
      'customers_active', (select count(*) from per_customer),
      'customers_returning', (select count(*) from per_customer where n >= 2),
      'cards_active', (select count(*) from public.cards where merchant_id = p_merchant and status = 'active'),
      'operations', (select count(*) from earn),
      'units_issued', (select coalesce(sum(units), 0) from earn),
      'redemptions', (select count(*) from t where type = 'redeem'),
      'rewards_ready', (select count(distinct c.id) from public.cards c join public.rewards r
                          on r.program_id = c.program_id and r.status = 'active' and r.cost <= c.balance
                        where c.merchant_id = p_merchant and c.status = 'active'),
      'series', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day,
                   'operations', (select count(*) from earn e where (e.created_at at time zone v_tz)::date = d.day),
                   'redemptions', (select count(*) from t x where x.type = 'redeem' and (x.created_at at time zone v_tz)::date = d.day),
                   'new_cards', (select count(*) from public.cards c where c.merchant_id = p_merchant
                                   and (c.created_at at time zone v_tz)::date = d.day)) order by d.day), '[]'::jsonb)
                 from (select generate_series((v_from at time zone v_tz)::date, (now() at time zone v_tz)::date, interval '1 day')::date as day) d),
      'programs', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'type', p.type, 'status', p.status,
                     'cards', (select count(*) from public.cards c where c.program_id = p.id),
                     'operations', (select count(*) from earn e where e.program_id = p.id),
                     'redemptions', (select count(*) from t x where x.type = 'redeem' and x.program_id = p.id))
                     order by p.created_at), '[]'::jsonb)
                   from public.programs p where p.merchant_id = p_merchant and p.status <> 'archived'),
      'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name,
                     'operations', (select count(*) from earn e where e.branch_id = b.id),
                     'redemptions', (select count(*) from t x where x.type = 'redeem' and x.branch_id = b.id))
                     order by b.name), '[]'::jsonb)
                   from public.branches b where b.merchant_id = p_merchant and b.active),
      'staff', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(nullif(pf.full_name, ''), pf.email),
                  'operations', s.ops, 'redemptions', s.reds) order by s.ops desc), '[]'::jsonb)
                from (select performed_by, count(*) filter (where type = 'earn') ops,
                             count(*) filter (where type = 'redeem') reds
                        from t where performed_by is not null group by performed_by) s
                left join public.profiles pf on pf.id = s.performed_by),
      'adjustments', (select count(*) from t where type in ('adjust','reversal')),
      'rejected_attempts', (select count(*) from public.audit_log a where a.merchant_id = p_merchant
                              and a.action = 'operation_rejected' and a.created_at >= v_from)
    )
  );
end $$;

create or replace function public.list_audit(p_merchant uuid, p_action text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_merchant is null then
    if not public.is_platform_admin() then perform public._err('forbidden', 'Sin permiso.'); end if;
  elsif not (public.has_permission(p_merchant, 'audit') or public.is_platform_admin()) then
    perform public._err('forbidden', 'No tenés permiso para ver la auditoría.');
  end if;
  p_limit := least(greatest(coalesce(p_limit, 50), 1), 500);
  return (
    with base as (
      select a.*, m.name as merchant_name, coalesce(nullif(pf.full_name, ''), pf.email) as actor_name
        from public.audit_log a
        left join public.merchants m on m.id = a.merchant_id
        left join public.profiles pf on pf.id = a.actor_id
       where (p_merchant is null or a.merchant_id = p_merchant)
         and (p_action is null or a.action = p_action or a.entity = p_action)
    )
    select jsonb_build_object('total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'merchant_id', x.merchant_id,
          'merchant_name', x.merchant_name, 'actor_name', x.actor_name, 'action', x.action, 'entity', x.entity,
          'entity_id', x.entity_id, 'details', x.details, 'created_at', x.created_at) order by x.id desc)
        from (select * from base order by id desc limit p_limit offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb))
  );
end $$;

-- -----------------------------------------------------------------------------
-- Equipo: invitaciones y membresías (no hay escritura directa sobre memberships)
-- -----------------------------------------------------------------------------
create or replace function public.staff_slots_used(p_merchant uuid)
returns int language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.memberships where merchant_id = p_merchant and role <> 'owner' and status = 'active')::int
       + (select count(*) from public.invitations where merchant_id = p_merchant and status = 'pending' and expires_at > now())::int
$$;

create or replace function public.invite_member(p_merchant uuid, p_email text, p_role text, p_full_name text default '',
  p_all_branches boolean default true, p_branch_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_role_in(p_merchant);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text; v_id uuid; v_max int;
begin
  if v_role is null or not public.role_has_permission(v_role, 'team') then
    perform public._err('forbidden', 'No tenés permiso para invitar personas.');
  end if;
  if p_role not in ('admin','manager','staff') or (v_role = 'admin' and p_role = 'admin') then
    perform public._err('forbidden_role', 'No podés asignar ese rol.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform public._err('invalid_email', 'Ingresá un correo electrónico válido.');
  end if;
  perform public.hit_rate_limit('invite:' || p_merchant, 30, 3600);
  if exists (select 1 from public.memberships ms join auth.users u on u.id = ms.user_id
              where ms.merchant_id = p_merchant and lower(u.email) = v_email) then
    perform public._err('already_member', 'Esa persona ya forma parte del equipo.');
  end if;
  update public.invitations set status = 'revoked'
   where merchant_id = p_merchant and lower(email) = v_email and status = 'pending';
  v_max := (public.merchant_plan(p_merchant)).max_staff;
  if v_max is not null and public.staff_slots_used(p_merchant) >= v_max then
    perform public._err('plan_limit', format('Tu plan permite hasta %s integrante(s) además del titular.', v_max));
  end if;
  if not coalesce(p_all_branches, true) then
    if coalesce(array_length(p_branch_ids, 1), 0) = 0 or exists (
         select 1 from unnest(p_branch_ids) b where not exists (
           select 1 from public.branches br where br.id = b and br.merchant_id = p_merchant)) then
      perform public._err('invalid_branches', 'Elegí al menos una sucursal válida.');
    end if;
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.invitations (merchant_id, email, full_name, role, all_branches, branch_ids, token_hash, invited_by)
  values (p_merchant, v_email, left(btrim(coalesce(p_full_name, '')), 120), p_role, coalesce(p_all_branches, true),
          case when coalesce(p_all_branches, true) then '{}' else p_branch_ids end,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;
  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end $$;

create or replace function public.get_invitation(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('merchant_name', m.name, 'merchant_logo', m.logo_url, 'role', i.role,
           'email_hint', public.mask_email(i.email), 'status', i.status,
           'expired', i.expires_at < now(), 'full_name', i.full_name)
    from public.invitations i join public.merchants m on m.id = i.merchant_id
   where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_i public.invitations; v_m_id uuid; v_max int;
begin
  if v_uid is null then perform public._err('not_authenticated', 'Iniciá sesión para aceptar la invitación.'); end if;
  perform public.hit_rate_limit('accept_invite:' || v_uid, 10, 3600);
  select * into v_i from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found or v_i.status <> 'pending' then
    perform public._err('invalid_invitation', 'La invitación no existe o ya fue utilizada.');
  end if;
  if v_i.expires_at < now() then perform public._err('invitation_expired', 'La invitación venció. Pedí una nueva.'); end if;
  if not public.auth_email_confirmed() or lower(public.auth_email()) <> lower(v_i.email) then
    perform public._err('email_mismatch', 'La invitación fue enviada a otro correo. Ingresá con esa cuenta.');
  end if;
  if exists (select 1 from public.memberships where merchant_id = v_i.merchant_id and user_id = v_uid) then
    perform public._err('already_member', 'Ya formás parte de este comercio.');
  end if;
  v_max := (public.merchant_plan(v_i.merchant_id)).max_staff;
  if v_max is not null and public.staff_slots_used(v_i.merchant_id) > v_max then
    perform public._err('plan_limit', 'El comercio alcanzó el límite de integrantes de su plan.');
  end if;
  insert into public.memberships (merchant_id, user_id, role, all_branches)
  values (v_i.merchant_id, v_uid, v_i.role, v_i.all_branches) returning id into v_m_id;
  insert into public.membership_branches (membership_id, merchant_id, branch_id)
    select v_m_id, v_i.merchant_id, b from unnest(v_i.branch_ids) b;
  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_i.id;
  if v_i.full_name <> '' then
    update public.profiles set full_name = v_i.full_name where id = v_uid and full_name = '';
  end if;
  return v_i.merchant_id;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_i public.invitations;
begin
  select * into v_i from public.invitations where id = p_invitation;
  if not found or not public.has_permission(v_i.merchant_id, 'team') then
    perform public._err('not_found', 'Invitación inexistente.');
  end if;
  update public.invitations set status = 'revoked' where id = p_invitation and status = 'pending';
end $$;

-- Reglas: nadie se modifica a sí mismo; el titular no se modifica; un admin solo gestiona encargados y empleados.
create or replace function public.assert_can_manage_member(p_target public.memberships, p_new_role text)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_role text := public.current_role_in(p_target.merchant_id);
begin
  if v_role is null or not public.role_has_permission(v_role, 'team') then
    perform public._err('forbidden', 'No tenés permiso para gestionar el equipo.');
  end if;
  if p_target.user_id = auth.uid() then
    perform public._err('self_change', 'No podés modificar tu propio rol o acceso.');
  end if;
  if p_target.role = 'owner' then perform public._err('forbidden', 'El titular no se puede modificar.'); end if;
  if p_new_role is not null and p_new_role not in ('admin','manager','staff') then
    perform public._err('forbidden_role', 'Rol inválido.');
  end if;
  if v_role = 'admin' and (p_target.role = 'admin' or p_new_role = 'admin') then
    perform public._err('forbidden_role', 'Solo el titular puede gestionar administradores.');
  end if;
end $$;

create or replace function public.update_member(p_membership uuid, p_role text, p_status text,
  p_all_branches boolean, p_branch_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if not found then perform public._err('not_found', 'Integrante inexistente.'); end if;
  perform public.assert_can_manage_member(v_m, p_role);
  if p_status not in ('active','disabled') then perform public._err('invalid', 'Estado inválido.'); end if;
  if not p_all_branches and (coalesce(array_length(p_branch_ids, 1), 0) = 0 or exists (
       select 1 from unnest(p_branch_ids) b where not exists (
         select 1 from public.branches br where br.id = b and br.merchant_id = v_m.merchant_id))) then
    perform public._err('invalid_branches', 'Elegí al menos una sucursal válida.');
  end if;
  update public.memberships set role = p_role, status = p_status, all_branches = p_all_branches where id = p_membership;
  delete from public.membership_branches where membership_id = p_membership;
  if not p_all_branches then
    insert into public.membership_branches (membership_id, merchant_id, branch_id)
      select p_membership, v_m.merchant_id, b from unnest(p_branch_ids) b;
  end if;
end $$;

create or replace function public.remove_member(p_membership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if not found then perform public._err('not_found', 'Integrante inexistente.'); end if;
  perform public.assert_can_manage_member(v_m, null);
  delete from public.memberships where id = p_membership;
end $$;

create or replace function public.get_team(p_merchant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_merchant, 'team') then
    perform public._err('forbidden', 'No tenés permiso para ver el equipo.');
  end if;
  return jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object('membership_id', ms.id, 'user_id', ms.user_id,
                  'name', nullif(pf.full_name, ''), 'email', pf.email, 'role', ms.role, 'status', ms.status,
                  'all_branches', ms.all_branches, 'created_at', ms.created_at, 'is_me', ms.user_id = auth.uid(),
                  'branch_ids', (select coalesce(jsonb_agg(mb.branch_id), '[]'::jsonb) from public.membership_branches mb
                                  where mb.membership_id = ms.id))
                  order by case ms.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end, pf.full_name), '[]'::jsonb)
                from public.memberships ms left join public.profiles pf on pf.id = ms.user_id
                where ms.merchant_id = p_merchant),
    'invitations', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'full_name', i.full_name,
                  'role', i.role, 'expires_at', i.expires_at, 'expired', i.expires_at < now(), 'created_at', i.created_at)
                  order by i.created_at desc), '[]'::jsonb)
                from public.invitations i where i.merchant_id = p_merchant and i.status = 'pending'),
    'slots_used', public.staff_slots_used(p_merchant),
    'slots_max', (public.merchant_plan(p_merchant)).max_staff
  );
end $$;

-- -----------------------------------------------------------------------------
-- Soporte y contacto
-- -----------------------------------------------------------------------------
create or replace function public.create_support_ticket(p_merchant uuid, p_subject text, p_body text, p_category text default 'general')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then perform public._err('not_authenticated', 'Iniciá sesión para continuar.'); end if;
  if p_merchant is not null and not public.is_member(p_merchant) then
    perform public._err('forbidden', 'No pertenecés a ese comercio.');
  end if;
  perform public.hit_rate_limit('ticket:' || auth.uid(), 10, 86400);
  insert into public.support_tickets (merchant_id, created_by, subject, body, category)
  values (p_merchant, auth.uid(), btrim(p_subject), btrim(p_body), coalesce(p_category, 'general'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.submit_contact_request(p_name text, p_email text, p_business text, p_phone text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.hit_rate_limit('contact:' || lower(coalesce(p_email, '')), 3, 3600);
  perform public.hit_rate_limit('contact:global', 200, 3600);
  insert into public.contact_requests (name, email, business_name, phone, message)
  values (btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_business), ''), nullif(btrim(p_phone), ''), btrim(p_message));
end $$;

-- -----------------------------------------------------------------------------
-- Administración global de NOVANTIQ
-- -----------------------------------------------------------------------------
create or replace function public.assert_platform_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    perform public._err('forbidden', 'Acceso restringido a la administración de NOVANTIQ.');
  end if;
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return jsonb_build_object(
    'merchants_total', (select count(*) from public.merchants),
    'merchants_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                              from (select status, count(*) n from public.merchants group by status) x),
    'subscriptions_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                              from (select status, count(*) n from public.subscriptions group by status) x),
    'mrr_ars', (select coalesce(sum(p.price_ars), 0) from public.subscriptions s join public.plans p on p.id = s.plan_id
                 where s.status = 'active'),
    'merchants_new_30d', (select count(*) from public.merchants where created_at > now() - interval '30 days'),
    'trials_ending_7d', (select count(*) from public.subscriptions where status = 'trialing'
                          and trial_ends_at between now() and now() + interval '7 days'),
    'cards_total', (select count(*) from public.cards),
    'customers_total', (select count(distinct customer_id) from public.cards),
    'operations_30d', (select count(*) from public.card_transactions where type = 'earn' and created_at > now() - interval '30 days'),
    'redemptions_30d', (select count(*) from public.redemptions where created_at > now() - interval '30 days'),
    'tickets_open', (select count(*) from public.support_tickets where status in ('open','in_progress')),
    'contacts_new', (select count(*) from public.contact_requests where status = 'new'),
    'rejected_attempts_7d', (select count(*) from public.audit_log where action = 'operation_rejected'
                              and created_at > now() - interval '7 days')
  );
end $$;

create or replace function public.admin_list_merchants(p_query text default null, p_status text default null,
  p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public.assert_platform_admin();
  return (
    with base as (
      select m.*, s.plan_id, s.status as sub_status, s.trial_ends_at, s.current_period_end,
             (select u.email from public.memberships ms join auth.users u on u.id = ms.user_id
               where ms.merchant_id = m.id and ms.role = 'owner') as owner_email,
             (select count(*) from public.cards c where c.merchant_id = m.id) as cards,
             (select max(t.created_at) from public.card_transactions t where t.merchant_id = m.id) as last_op
        from public.merchants m left join public.subscriptions s on s.merchant_id = m.id
       where (v_q is null or m.name ilike '%' || v_q || '%' or m.slug ilike '%' || v_q || '%')
         and (p_status is null or m.status = p_status or s.status = p_status)
    )
    select jsonb_build_object('total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug,
          'category', b.category, 'status', b.status, 'status_reason', b.status_reason, 'created_at', b.created_at,
          'plan_id', b.plan_id, 'subscription_status', b.sub_status, 'trial_ends_at', b.trial_ends_at,
          'current_period_end', b.current_period_end, 'owner_email', b.owner_email, 'cards', b.cards,
          'last_operation_at', b.last_op, 'operational_status', public.merchant_operational_status(b.id)) order by b.created_at desc)
        from (select * from base order by created_at desc limit least(greatest(p_limit, 1), 200)
              offset greatest(p_offset, 0)) b), '[]'::jsonb))
  );
end $$;

create or replace function public.admin_set_merchant_status(p_merchant uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  if p_status not in ('active','suspended','closed') then perform public._err('invalid', 'Estado inválido.'); end if;
  update public.merchants set status = p_status, status_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = p_merchant;
  if not found then perform public._err('not_found', 'Comercio inexistente.'); end if;
end $$;

create or replace function public.admin_update_subscription(p_merchant uuid, p_plan text, p_status text,
  p_trial_ends_at timestamptz default null, p_period_end timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  update public.subscriptions
     set plan_id = p_plan, status = p_status,
         trial_ends_at = coalesce(p_trial_ends_at, trial_ends_at),
         current_period_end = coalesce(p_period_end, current_period_end)
   where merchant_id = p_merchant;
  if not found then perform public._err('not_found', 'Suscripción inexistente.'); end if;
end $$;

create or replace function public.admin_update_ticket(p_ticket uuid, p_status text, p_priority text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  update public.support_tickets set status = p_status, priority = p_priority, admin_notes = p_notes where id = p_ticket;
end $$;

create or replace function public.admin_list_tickets(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'body', t.body,
            'category', t.category, 'status', t.status, 'priority', t.priority, 'admin_notes', t.admin_notes,
            'created_at', t.created_at, 'merchant_name', m.name, 'author_email', pf.email) order by t.created_at desc), '[]'::jsonb)
          from public.support_tickets t left join public.merchants m on m.id = t.merchant_id
          left join public.profiles pf on pf.id = t.created_by
          where p_status is null or t.status = p_status);
end $$;

create or replace function public.admin_update_contact(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_platform_admin();
  update public.contact_requests set status = p_status where id = p_id;
end $$;

-- -----------------------------------------------------------------------------
-- Facturación: solo la invoca la Edge Function con service_role.
-- -----------------------------------------------------------------------------
create or replace function public.billing_apply_update(p_merchant uuid, p_plan text, p_status text,
  p_provider_subscription_id text, p_payer_email text, p_period_end timestamptz, p_paid_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions
     set plan_id = coalesce(p_plan, plan_id),
         status = p_status,
         provider = 'mercadopago',
         provider_subscription_id = coalesce(p_provider_subscription_id, provider_subscription_id),
         provider_payer_email = coalesce(p_payer_email, provider_payer_email),
         current_period_end = coalesce(p_period_end, current_period_end),
         last_payment_at = coalesce(p_paid_at, last_payment_at),
         pending_plan_id = case when p_status = 'active' then null else pending_plan_id end
   where merchant_id = p_merchant;
end $$;

-- -----------------------------------------------------------------------------
-- Privilegios de ejecución: por defecto nadie; se habilita explícitamente.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Funciones usadas por las políticas RLS
grant execute on function public.is_platform_admin(), public.is_member(uuid), public.has_permission(uuid, text),
  public.current_role_in(uuid), public.role_has_permission(text, text) to anon, authenticated;

-- Públicas (sitio y páginas de inscripción)
grant execute on function public.get_public_program(text), public.get_invitation(text),
  public.submit_contact_request(text, text, text, text, text) to anon, authenticated;

-- Usuarios autenticados (cada función verifica permisos internamente)
grant execute on function
  public.create_merchant(text, text), public.complete_onboarding(uuid), public.my_memberships(),
  public.set_program_status(uuid, text), public.duplicate_program(uuid),
  public.join_program(text), public.get_my_wallet(), public.get_my_card(uuid), public.leave_program(uuid),
  public.export_my_data(),
  public.staff_lookup_card(uuid, uuid, text), public.record_earn(uuid, uuid, text, int, numeric, text, text),
  public.redeem_reward(uuid, uuid, text, uuid, text), public.reverse_transaction(uuid, text, text),
  public.adjust_balance(uuid, uuid, int, text, text), public.set_card_status(uuid, text, text),
  public.search_customers(uuid, text, uuid, int, int), public.get_card_detail(uuid, uuid),
  public.list_transactions(uuid, text, uuid, timestamptz, timestamptz, int, int),
  public.merchant_dashboard(uuid, int), public.list_audit(uuid, text, int, int),
  public.invite_member(uuid, text, text, text, boolean, uuid[]), public.accept_invitation(text),
  public.revoke_invitation(uuid), public.update_member(uuid, text, text, boolean, uuid[]),
  public.remove_member(uuid), public.get_team(uuid), public.create_support_ticket(uuid, text, text, text),
  public.admin_overview(), public.admin_list_merchants(text, text, int, int),
  public.admin_set_merchant_status(uuid, text, text),
  public.admin_update_subscription(uuid, text, text, timestamptz, timestamptz),
  public.admin_update_ticket(uuid, text, text, text), public.admin_list_tickets(text),
  public.admin_update_contact(uuid, text)
to authenticated;
