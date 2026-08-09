-- 02_sms_campaigns.sql
-- GetStampd SMS Messaging — campaigns and per-recipient delivery state.
--
-- What this does:
--   * public.sms_campaigns            one row per SMS send (or draft)
--   * public.sms_campaign_recipients  one row per recipient, provider status
--
-- Drafts may be written by any accepted organisation member (they cost
-- nothing). Everything from `queued` onwards is written only by the definer
-- RPCs / the service-role sender, so credits can never be bypassed.
--
-- Additive and idempotent. Safe to re-run. Apply in the Supabase SQL editor.

begin;

create table if not exists public.sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  created_by uuid,
  sent_by uuid,
  name text,
  message text not null,
  encoding text not null default 'GSM-7' check (encoding in ('GSM-7', 'UCS-2')),
  sms_segments_per_recipient integer not null default 1 check (sms_segments_per_recipient > 0),
  intended_recipient_count integer not null default 0 check (intended_recipient_count >= 0),
  credits_required bigint not null default 0 check (credits_required >= 0),
  credits_used bigint not null default 0 check (credits_used >= 0),
  audience_kind text not null default 'all_opted_in' check (audience_kind in (
    'all_opted_in', 'checked_in', 'not_checked_in', 'venue_visited'
  )),
  audience_params jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in (
    'draft', 'queued', 'sending', 'completed', 'partially_failed', 'failed', 'cancelled'
  )),
  provider_batch_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,

  constraint sms_campaigns_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint sms_campaigns_tenant_unique unique (agency_id, id),
  constraint sms_campaigns_message_length check (char_length(message) between 1 and 1600)
);

create index if not exists idx_sms_campaigns_agency_time
  on public.sms_campaigns (agency_id, created_at desc);
create index if not exists idx_sms_campaigns_event_time
  on public.sms_campaigns (event_id, created_at desc);
create index if not exists idx_sms_campaigns_status
  on public.sms_campaigns (status) where status in ('queued', 'sending');

drop trigger if exists set_updated_at on public.sms_campaigns;
create trigger set_updated_at
  before update on public.sms_campaigns
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.sms_campaigns to authenticated;
grant all on public.sms_campaigns to service_role;

alter table public.sms_campaigns enable row level security;

drop policy if exists sms_campaigns_select on public.sms_campaigns;
create policy sms_campaigns_select
  on public.sms_campaigns for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

-- Members may create and edit DRAFTS only. Sending is an RPC, never an UPDATE.
drop policy if exists sms_campaigns_insert_draft on public.sms_campaigns;
create policy sms_campaigns_insert_draft
  on public.sms_campaigns for insert to authenticated
  with check (
    status = 'draft'
    and (
      public.is_platform_admin(auth.uid())
      or public.is_agency_admin(auth.uid(), agency_id)
      or public.is_agency_member(auth.uid(), agency_id)
    )
  );

drop policy if exists sms_campaigns_update_draft on public.sms_campaigns;
create policy sms_campaigns_update_draft
  on public.sms_campaigns for update to authenticated
  using (
    status = 'draft'
    and (
      public.is_platform_admin(auth.uid())
      or public.is_agency_admin(auth.uid(), agency_id)
      or public.is_agency_member(auth.uid(), agency_id)
    )
  )
  with check (
    status = 'draft'
    and (
      public.is_platform_admin(auth.uid())
      or public.is_agency_admin(auth.uid(), agency_id)
      or public.is_agency_member(auth.uid(), agency_id)
    )
  );

drop policy if exists sms_campaigns_delete_draft on public.sms_campaigns;
create policy sms_campaigns_delete_draft
  on public.sms_campaigns for delete to authenticated
  using (
    status = 'draft'
    and (
      public.is_platform_admin(auth.uid())
      or public.is_agency_admin(auth.uid(), agency_id)
      or public.is_agency_member(auth.uid(), agency_id)
    )
  );

-- Recipients --------------------------------------------------------------
create table if not exists public.sms_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  agency_id uuid not null,
  event_id uuid not null,
  visitor_id uuid,
  passport_id uuid,
  phone_e164 text not null,
  status text not null default 'queued' check (status in (
    'queued', 'submitted', 'delivered', 'failed', 'rejected', 'opted_out'
  )),
  provider_message_id text,
  credits_used bigint not null default 0 check (credits_used >= 0),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sms_campaign_recipients_campaign_fk
    foreign key (agency_id, campaign_id) references public.sms_campaigns(agency_id, id) on delete cascade,
  constraint sms_campaign_recipients_unique_per_campaign unique (campaign_id, phone_e164)
);

create index if not exists idx_sms_campaign_recipients_campaign
  on public.sms_campaign_recipients (campaign_id, status);
create index if not exists idx_sms_campaign_recipients_provider_msg
  on public.sms_campaign_recipients (provider_message_id);

drop trigger if exists set_updated_at on public.sms_campaign_recipients;
create trigger set_updated_at
  before update on public.sms_campaign_recipients
  for each row execute function public.tg_set_updated_at();

grant select on public.sms_campaign_recipients to authenticated;
grant all on public.sms_campaign_recipients to service_role;
-- No write grants: recipients are created by the reserve RPC and updated by
-- the server-side sender / delivery-receipt webhook only.

alter table public.sms_campaign_recipients enable row level security;

drop policy if exists sms_campaign_recipients_select on public.sms_campaign_recipients;
create policy sms_campaign_recipients_select
  on public.sms_campaign_recipients for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

-- Late FK from the ledger to campaigns (table exists only now).
do $$ begin
  alter table public.sms_credit_transactions
    add constraint sms_credit_transactions_campaign_fk
    foreign key (sms_campaign_id) references public.sms_campaigns(id) on delete set null;
exception when duplicate_object then null; end $$;

commit;
