-- =============================================================================
-- NOVANTIQ Fideliza — Esquema base (multi-tenant)
-- Cada registro comercial lleva merchant_id. Ningún saldo se modifica desde el
-- cliente: las tablas operativas solo se escriben mediante funciones del servidor.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Lanza un error con un código estable (message) y un texto para el usuario (detail).
create or replace function public._err(p_code text, p_detail text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail;
end $$;

-- -----------------------------------------------------------------------------
-- Plataforma
-- -----------------------------------------------------------------------------
create table public.plans (
  id            text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  name          text not null check (char_length(name) between 2 and 40),
  description   text not null default '' check (char_length(description) <= 300),
  price_ars     numeric(12,2) not null check (price_ars >= 0),
  max_branches  int check (max_branches > 0),   -- null = sin límite
  max_staff     int check (max_staff >= 0),
  max_programs  int check (max_programs > 0),
  max_cards     int check (max_cards > 0),
  features      jsonb not null default '{}'::jsonb,
  sort_order    int not null default 0,
  is_public     boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Administradores globales: solo se agregan con SQL/service role (nunca desde la app).
create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  key        text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  value      jsonb not null,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null default '' check (char_length(full_name) <= 120),
  email            text,
  phone            text check (char_length(phone) <= 40),
  marketing_opt_in boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Comercios (tenants)
-- -----------------------------------------------------------------------------
create table public.merchants (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,46})[a-z0-9]$'),
  name                    text not null check (char_length(name) between 2 and 80),
  category                text not null default 'otro' check (category in (
                            'cafeteria','restaurante','panaderia','hamburgueseria','heladeria',
                            'lavadero','peluqueria','barberia','estetica','gimnasio','mascotas',
                            'indumentaria','almacen','farmacia','otro')),
  description             text not null default '' check (char_length(description) <= 500),
  logo_url                text check (char_length(logo_url) <= 500),
  brand_color             text not null default '#B7F000' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  brand_text_color        text not null default '#0B0B0D' check (brand_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  contact_email           text check (char_length(contact_email) <= 160),
  phone                   text check (char_length(phone) <= 40),
  website                 text check (char_length(website) <= 200),
  instagram               text check (char_length(instagram) <= 80),
  address                 text check (char_length(address) <= 200),
  city                    text check (char_length(city) <= 80),
  province                text check (char_length(province) <= 80),
  timezone                text not null default 'America/Argentina/Buenos_Aires',
  status                  text not null default 'active' check (status in ('active','suspended','closed')),
  status_reason           text,
  onboarding_step         int not null default 1 check (onboarding_step between 1 and 6),
  onboarding_data         jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  merchant_id              uuid primary key references public.merchants(id) on delete cascade,
  plan_id                  text not null references public.plans(id),
  status                   text not null check (status in ('trialing','active','past_due','paused','cancelled')),
  trial_ends_at            timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  provider                 text check (provider in ('mercadopago','manual')),
  provider_subscription_id text unique,
  provider_payer_email     text,
  pending_plan_id          text references public.plans(id),
  last_payment_at          timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Registro idempotente de notificaciones del proveedor de pagos.
create table public.billing_events (
  id                bigserial primary key,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  merchant_id       uuid references public.merchants(id) on delete set null,
  payload           jsonb not null default '{}'::jsonb,
  processed_at      timestamptz,
  error             text,
  created_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 60),
  address     text check (char_length(address) <= 200),
  phone       text check (char_length(phone) <= 40),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (merchant_id, name),
  unique (merchant_id, id)
);
create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','admin','manager','staff')),
  status       text not null default 'active' check (status in ('active','disabled')),
  all_branches boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (merchant_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create unique index memberships_one_owner on public.memberships(merchant_id) where role = 'owner';
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

create table public.membership_branches (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  merchant_id   uuid not null,
  branch_id     uuid not null,
  primary key (membership_id, branch_id),
  foreign key (merchant_id, branch_id) references public.branches(merchant_id, id) on delete cascade
);

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  email        text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name    text not null default '' check (char_length(full_name) <= 120),
  role         text not null check (role in ('admin','manager','staff')),
  all_branches boolean not null default true,
  branch_ids   uuid[] not null default '{}',
  token_hash   text not null unique,
  status       text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by   uuid references auth.users(id) on delete set null,
  accepted_by  uuid references auth.users(id) on delete set null,
  accepted_at  timestamptz,
  expires_at   timestamptz not null default now() + interval '7 days',
  created_at   timestamptz not null default now()
);
create index invitations_merchant_idx on public.invitations(merchant_id, status);
create unique index invitations_one_pending on public.invitations(merchant_id, lower(email)) where status = 'pending';

-- -----------------------------------------------------------------------------
-- Programas de fidelización
-- -----------------------------------------------------------------------------
create table public.programs (
  id                  uuid primary key default gen_random_uuid(),
  merchant_id         uuid not null references public.merchants(id) on delete cascade,
  type                text not null check (type in ('stamps','visits','points','milestones')),
  name                text not null check (char_length(name) between 2 and 60),
  description         text not null default '' check (char_length(description) <= 300),
  status              text not null default 'draft' check (status in ('draft','active','paused','archived')),
  version             int not null default 1,
  -- Reglas (sellos / visitas)
  stamps_required     int check (stamps_required between 2 and 50),
  max_units_per_tx    int not null default 1 check (max_units_per_tx between 1 and 20),
  -- Reglas (puntos): earn_points puntos por cada earn_amount pesos elegibles
  earn_points         int check (earn_points between 1 and 1000),
  earn_amount         numeric(12,2) check (earn_amount >= 1),
  max_points_per_tx   int check (max_points_per_tx between 1 and 1000000),
  max_amount_per_tx   numeric(12,2) check (max_amount_per_tx > 0),
  -- Antiabuso
  daily_limit_per_card int not null default 3 check (daily_limit_per_card between 1 and 50),
  min_minutes_between  int not null default 0 check (min_minutes_between between 0 and 1440),
  welcome_bonus        int not null default 0 check (welcome_bonus between 0 and 1000),
  -- Presentación
  terms               text not null default '' check (char_length(terms) <= 2000),
  bg_color            text not null default '#17191D' check (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color          text not null default '#FFFFFF' check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color        text not null default '#B7F000' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url            text check (char_length(logo_url) <= 500),
  stamp_icon          text not null default 'star' check (stamp_icon in ('star','coffee','heart','check','scissors','paw','burger','icecream','car','dumbbell','sparkles','bread')),
  theme               text not null default 'classic' check (theme in ('classic','cafe','barber','burger','icecream','carwash','gym','beauty','pets')),
  starts_at           timestamptz,
  ends_at             timestamptz,
  all_branches        boolean not null default true,
  join_code           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  join_enabled        boolean not null default true,
  published_at        timestamptz,
  archived_at         timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (merchant_id, id),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (type not in ('stamps','visits') or stamps_required is not null),
  check (type <> 'points' or (earn_points is not null and earn_amount is not null))
);
create index programs_merchant_idx on public.programs(merchant_id, status);
create trigger programs_updated_at before update on public.programs
  for each row execute function public.set_updated_at();

-- Historial inmutable de reglas. Cada movimiento guarda la versión vigente.
create table public.program_versions (
  id          bigserial primary key,
  program_id  uuid not null references public.programs(id) on delete cascade,
  merchant_id uuid not null,
  version     int not null,
  rules       jsonb not null,
  changed_by  uuid,
  created_at  timestamptz not null default now(),
  unique (program_id, version)
);

create table public.program_branches (
  program_id  uuid not null,
  branch_id   uuid not null,
  merchant_id uuid not null,
  primary key (program_id, branch_id),
  foreign key (merchant_id, program_id) references public.programs(merchant_id, id) on delete cascade,
  foreign key (merchant_id, branch_id) references public.branches(merchant_id, id) on delete cascade
);

create table public.rewards (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references public.merchants(id) on delete cascade,
  program_id     uuid not null,
  name           text not null check (char_length(name) between 2 and 80),
  description    text not null default '' check (char_length(description) <= 300),
  image_url      text check (char_length(image_url) <= 500),
  cost           int not null check (cost between 1 and 1000000),
  terms          text not null default '' check (char_length(terms) <= 1000),
  valid_from     timestamptz,
  valid_until    timestamptz,
  stock          int check (stock >= 0),
  redeemed_count int not null default 0 check (redeemed_count >= 0),
  max_per_card   int check (max_per_card >= 1),
  status         text not null default 'active' check (status in ('active','paused','archived')),
  all_branches   boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (merchant_id, id),
  foreign key (merchant_id, program_id) references public.programs(merchant_id, id) on delete cascade,
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);
create index rewards_program_idx on public.rewards(program_id, status);
create trigger rewards_updated_at before update on public.rewards
  for each row execute function public.set_updated_at();

create table public.reward_branches (
  reward_id   uuid not null,
  branch_id   uuid not null,
  merchant_id uuid not null,
  primary key (reward_id, branch_id),
  foreign key (merchant_id, reward_id) references public.rewards(merchant_id, id) on delete cascade,
  foreign key (merchant_id, branch_id) references public.branches(merchant_id, id) on delete cascade
);

create table public.promotions (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  program_id  uuid,
  title       text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  terms       text not null default '' check (char_length(terms) <= 1000),
  image_url   text check (char_length(image_url) <= 500),
  starts_at   timestamptz,
  ends_at     timestamptz,
  status      text not null default 'draft' check (status in ('draft','active','paused','archived')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (merchant_id, program_id) references public.programs(merchant_id, id) on delete cascade,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger promotions_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tarjetas, movimientos y canjes
-- -----------------------------------------------------------------------------
create table public.cards (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references public.merchants(id) on delete cascade,
  program_id       uuid not null,
  customer_id      uuid not null references auth.users(id) on delete cascade,
  code             text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  public_token     text not null unique check (public_token ~ '^[0-9a-f]{32}$'),
  status           text not null default 'active' check (status in ('active','blocked','closed')),
  status_reason    text,
  balance          int not null default 0 check (balance >= 0),
  lifetime_earned  int not null default 0 check (lifetime_earned >= 0),
  lifetime_redeemed int not null default 0 check (lifetime_redeemed >= 0),
  last_activity_at timestamptz,
  joined_branch_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (program_id, customer_id),
  unique (merchant_id, id),
  foreign key (merchant_id, program_id) references public.programs(merchant_id, id) on delete cascade
);
create index cards_merchant_idx on public.cards(merchant_id, created_at desc);
create index cards_customer_idx on public.cards(customer_id);
create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- Secreto para el QR rotativo. Solo lo lee el titular de la tarjeta.
create table public.card_secrets (
  card_id uuid primary key references public.cards(id) on delete cascade,
  secret  text not null
);

create table public.card_transactions (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null,
  card_id         uuid not null,
  program_id      uuid not null,
  program_version int not null,
  type            text not null check (type in ('earn','welcome','redeem','adjust','reversal')),
  delta           int not null,                 -- cambio firmado en el saldo
  units           int not null default 0,       -- sellos/visitas/puntos involucrados
  purchase_amount numeric(12,2) check (purchase_amount >= 0),
  reason          text check (char_length(reason) <= 300),
  reward_id       uuid,
  redemption_id   uuid,
  reverses_id     uuid unique references public.card_transactions(id),
  status          text not null default 'completed' check (status in ('completed','reversed')),
  performed_by    uuid references auth.users(id) on delete set null,
  branch_id       uuid,
  lookup_method   text not null default 'system' check (lookup_method in ('qr','code','system','self')),
  idempotency_key text check (char_length(idempotency_key) between 8 and 100),
  balance_after   int not null,
  created_at      timestamptz not null default now(),
  foreign key (merchant_id, card_id) references public.cards(merchant_id, id) on delete cascade,
  unique (merchant_id, idempotency_key)
);
create index card_tx_card_idx on public.card_transactions(card_id, created_at desc);
create index card_tx_merchant_idx on public.card_transactions(merchant_id, created_at desc);
create index card_tx_performed_idx on public.card_transactions(merchant_id, performed_by, created_at desc);

create table public.redemptions (
  id                    uuid primary key default gen_random_uuid(),
  merchant_id           uuid not null,
  card_id               uuid not null,
  reward_id             uuid not null,
  transaction_id        uuid not null references public.card_transactions(id),
  cost                  int not null,
  status                text not null default 'completed' check (status in ('completed','cancelled')),
  performed_by          uuid references auth.users(id) on delete set null,
  branch_id             uuid,
  cancelled_by          uuid references auth.users(id) on delete set null,
  cancelled_at          timestamptz,
  cancel_reason         text,
  cancel_transaction_id uuid references public.card_transactions(id),
  created_at            timestamptz not null default now(),
  foreign key (merchant_id, card_id) references public.cards(merchant_id, id) on delete cascade,
  foreign key (merchant_id, reward_id) references public.rewards(merchant_id, id)
);
create index redemptions_card_idx on public.redemptions(card_id, reward_id, status);
create index redemptions_merchant_idx on public.redemptions(merchant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Auditoría, abuso, soporte
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  merchant_id uuid,               -- sin FK: el registro de auditoría sobrevive al comercio
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_merchant_idx on public.audit_log(merchant_id, created_at desc);
create index audit_created_idx on public.audit_log(created_at desc);

create table public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, window_start)
);

create table public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchants(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  subject     text not null check (char_length(subject) between 3 and 120),
  body        text not null check (char_length(body) between 3 and 4000),
  category    text not null default 'general' check (category in ('general','facturacion','tecnico','abuso','datos')),
  status      text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  admin_notes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.contact_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 120),
  email         text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 160),
  business_name text check (char_length(business_name) <= 120),
  phone         text check (char_length(phone) <= 40),
  message       text not null check (char_length(message) between 5 and 2000),
  status        text not null default 'new' check (status in ('new','contacted','closed')),
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Datos de referencia (los precios son propuestas: confirmar con el propietario)
-- -----------------------------------------------------------------------------
insert into public.plans (id, name, description, price_ars, max_branches, max_staff, max_programs, max_cards, features, sort_order) values
  ('inicial', 'Inicial', 'Para empezar: una sucursal y una tarjeta de sellos.', 14900, 1, 3, 1, 500,
     '{"points": false, "milestones": false, "promotions": false, "export": false}', 1),
  ('profesional', 'Profesional', 'Más programas, puntos, promociones y exportación.', 29900, 3, 10, 5, 5000,
     '{"points": true, "milestones": true, "promotions": true, "export": true}', 2),
  ('multisucursal', 'Multisucursal', 'Cadenas y comercios con varios locales.', 59900, 20, 60, 20, null,
     '{"points": true, "milestones": true, "promotions": true, "export": true}', 3)
on conflict (id) do nothing;

insert into public.platform_settings (key, value, is_public) values
  ('trial.plan_id', '"profesional"', false),
  ('trial.days', '14', true),
  ('limits.merchants_per_user', '3', false),
  ('billing.grace_days', '7', false),
  ('limits.ops_per_minute', '30', false),
  ('limits.lookups_per_minute', '60', false),
  ('contact.whatsapp', '""', true),
  ('contact.email', '"hola@novantiq.com.ar"', true)
on conflict (key) do nothing;
