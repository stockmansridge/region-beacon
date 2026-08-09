-- 01_sms_credit_core.sql
-- GetStampd SMS Messaging (prepaid credits) — core credit tables.
--
-- What this does:
--   * public.sms_credit_accounts       one balance row per organisation (agency)
--   * public.sms_credit_transactions   immutable signed credit ledger
--   * public.sms_credit_packs          admin-configurable prepaid packs (+ seed)
--
-- Balance columns are a cache. The ledger is the authoritative audit trail.
-- No role except service_role may write these tables directly; all mutations
-- go through the SECURITY DEFINER RPCs in 05_sms_rpcs_credits.sql.
--
-- Additive and idempotent. Safe to re-run. Apply in the Supabase SQL editor.

begin;

-- 0. Preflight: this file depends on public.agencies and the shared
-- updated_at trigger helper. If either is missing, stop with a clear message
-- (this is the usual reason 05/06 later report "type ... does not exist").
do $$
begin
  if to_regclass('public.agencies') is null then
    raise exception '01_sms_credit_core.sql: public.agencies is missing — wrong database?';
  end if;
end;
$$;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. Credit accounts ------------------------------------------------------
create table if not exists public.sms_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  balance_credits bigint not null default 0,
  lifetime_purchased_credits bigint not null default 0,
  lifetime_used_credits bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sms_credit_accounts_agency_fk
    foreign key (agency_id) references public.agencies(id) on delete cascade,
  constraint sms_credit_accounts_agency_unique unique (agency_id),
  constraint sms_credit_accounts_balance_non_negative check (balance_credits >= 0)
);

drop trigger if exists set_updated_at on public.sms_credit_accounts;
create trigger set_updated_at
  before update on public.sms_credit_accounts
  for each row execute function public.tg_set_updated_at();

grant select on public.sms_credit_accounts to authenticated;
grant all on public.sms_credit_accounts to service_role;
-- No INSERT/UPDATE/DELETE grant: balances change only via definer RPCs.

alter table public.sms_credit_accounts enable row level security;

drop policy if exists sms_credit_accounts_select on public.sms_credit_accounts;
create policy sms_credit_accounts_select
  on public.sms_credit_accounts for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

-- 2. Credit ledger --------------------------------------------------------
create table if not exists public.sms_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid,
  transaction_type text not null check (transaction_type in (
    'purchase', 'send', 'refund', 'adjustment', 'failed_send_recredit'
  )),
  credits bigint not null,
  balance_after bigint not null,
  amount_paid_cents integer,
  currency text not null default 'AUD',
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  sms_campaign_id uuid,
  description text,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint sms_credit_transactions_agency_fk
    foreign key (agency_id) references public.agencies(id) on delete cascade,
  constraint sms_credit_transactions_credits_nonzero check (credits <> 0),
  -- Credits added are positive, credits consumed are negative.
  constraint sms_credit_transactions_sign check (
    case
      when transaction_type in ('purchase', 'refund', 'failed_send_recredit') then credits > 0
      when transaction_type = 'send' then credits < 0
      else true
    end
  )
);

create index if not exists idx_sms_credit_tx_agency_time
  on public.sms_credit_transactions (agency_id, created_at desc);
create index if not exists idx_sms_credit_tx_campaign
  on public.sms_credit_transactions (sms_campaign_id);

-- Idempotency guard: one purchase per Stripe Checkout Session / PaymentIntent.
create unique index if not exists uq_sms_credit_tx_checkout_session
  on public.sms_credit_transactions (stripe_checkout_session_id)
  where transaction_type = 'purchase' and stripe_checkout_session_id is not null;
create unique index if not exists uq_sms_credit_tx_payment_intent
  on public.sms_credit_transactions (stripe_payment_intent_id)
  where transaction_type = 'purchase' and stripe_payment_intent_id is not null;

grant select on public.sms_credit_transactions to authenticated;
grant all on public.sms_credit_transactions to service_role;
-- No INSERT/UPDATE/DELETE grant: the ledger is append-only via definer RPCs.

alter table public.sms_credit_transactions enable row level security;

drop policy if exists sms_credit_transactions_select on public.sms_credit_transactions;
create policy sms_credit_transactions_select
  on public.sms_credit_transactions for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

-- 3. Credit packs ---------------------------------------------------------
create table if not exists public.sms_credit_packs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  credits bigint not null check (credits > 0),
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'AUD',
  badge text,
  active boolean not null default true,
  sort_order integer not null default 0,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.sms_credit_packs;
create trigger set_updated_at
  before update on public.sms_credit_packs
  for each row execute function public.tg_set_updated_at();

grant select on public.sms_credit_packs to authenticated;
grant all on public.sms_credit_packs to service_role;

alter table public.sms_credit_packs enable row level security;

drop policy if exists sms_credit_packs_select on public.sms_credit_packs;
create policy sms_credit_packs_select
  on public.sms_credit_packs for select to authenticated
  using (active or public.is_platform_admin(auth.uid()));

drop policy if exists sms_credit_packs_write on public.sms_credit_packs;
create policy sms_credit_packs_write
  on public.sms_credit_packs for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- Seed the launch packs. Prices are AUD cents, set so every pack clears the
-- 20% minimum markup at the $0.072/segment wholesale assumption.
-- Re-running does not change prices an admin has since edited.
insert into public.sms_credit_packs (code, name, credits, price_cents, currency, badge, sort_order)
values
  ('sms_1k',  '1,000 SMS Credits',   1000,   9500, 'AUD', null,           10),
  ('sms_5k',  '5,000 SMS Credits',   5000,  45000, 'AUD', 'Popular',      20),
  ('sms_10k', '10,000 SMS Credits', 10000,  87500, 'AUD', 'Large events', 30),
  ('sms_25k', '25,000 SMS Credits', 25000, 220000, 'AUD', 'Major events', 40)
on conflict (code) do nothing;

commit;
