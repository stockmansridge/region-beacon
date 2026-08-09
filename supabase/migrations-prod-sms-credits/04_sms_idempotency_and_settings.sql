-- 04_sms_idempotency_and_settings.sql
-- GetStampd SMS Messaging — Stripe webhook idempotency + internal provider cost.
--
-- What this does:
--   * public.sms_stripe_events    one row per processed Stripe event id.
--                                 A replayed webhook hits the unique index and
--                                 is a no-op, so credits can never double up.
--   * public.sms_provider_settings internal wholesale cost per segment and the
--                                 minimum markup target. PLATFORM ADMIN ONLY —
--                                 customers must never read this.
--   * public.sms_inbound_messages inbound provider messages (STOP handling audit)
--
-- Additive and idempotent. Safe to re-run. Apply in the Supabase SQL editor.

begin;

create table if not exists public.sms_stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  agency_id uuid,
  processed_at timestamptz not null default now(),
  payload_summary jsonb not null default '{}'::jsonb
);

grant all on public.sms_stripe_events to service_role;
-- Deliberately no grants for anon/authenticated: server-side only.

alter table public.sms_stripe_events enable row level security;

drop policy if exists sms_stripe_events_admin_select on public.sms_stripe_events;
create policy sms_stripe_events_admin_select
  on public.sms_stripe_events for select to authenticated
  using (public.is_platform_admin(auth.uid()));

-- Internal provider economics --------------------------------------------
create table if not exists public.sms_provider_settings (
  id boolean primary key default true check (id),
  provider text not null default 'clicksend',
  wholesale_cost_cents_per_segment numeric(10, 4) not null default 7.2000,
  currency text not null default 'AUD',
  minimum_markup_percent numeric(6, 2) not null default 20.00,
  notes text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.sms_provider_settings;
create trigger set_updated_at
  before update on public.sms_provider_settings
  for each row execute function public.tg_set_updated_at();

insert into public.sms_provider_settings (id, provider, wholesale_cost_cents_per_segment, minimum_markup_percent, notes)
values (true, 'clicksend', 7.2000, 20.00, 'Initial assumed AU wholesale cost: $0.072 per segment. Editable by platform admins as volume rates improve.')
on conflict (id) do nothing;

grant all on public.sms_provider_settings to service_role;
-- No customer grants at all: this is internal margin data.

alter table public.sms_provider_settings enable row level security;

drop policy if exists sms_provider_settings_admin_all on public.sms_provider_settings;
create policy sms_provider_settings_admin_all
  on public.sms_provider_settings for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Inbound messages (STOP / replies) --------------------------------------
create table if not exists public.sms_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'clicksend',
  provider_message_id text,
  from_e164 text,
  to_number text,
  body text,
  is_opt_out boolean not null default false,
  matched_visitor_count integer not null default 0,
  received_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,

  constraint sms_inbound_messages_provider_msg_unique unique (provider, provider_message_id)
);

create index if not exists idx_sms_inbound_from on public.sms_inbound_messages (from_e164, received_at desc);

grant all on public.sms_inbound_messages to service_role;

alter table public.sms_inbound_messages enable row level security;

drop policy if exists sms_inbound_messages_admin_select on public.sms_inbound_messages;
create policy sms_inbound_messages_admin_select
  on public.sms_inbound_messages for select to authenticated
  using (public.is_platform_admin(auth.uid()));

commit;
