-- 31_seed_reserved_subdomains.sql
-- Draft only. Do not execute.
-- Seeds reserved-subdomain rows. domain_type='platform_reserved'.

insert into public.event_domains (
  agency_id, event_id, public_subdomain, custom_domain,
  domain_type, status, is_primary
)
select null, null, sub, null, 'platform_reserved', 'active', false
from (values
  ('app'),('www'),('admin'),('api'),('support'),('status'),('help'),('mail'),
  ('docs'),('blog'),('dashboard'),('auth'),('login'),('signup'),('billing'),
  ('public'),('static'),('cdn'),('assets'),('dev'),('staging'),('test')
) as r(sub)
on conflict (public_subdomain) where public_subdomain is not null do nothing;

-- Platform marketing + admin host placeholders (not reserved, but tracked).
insert into public.event_domains (
  agency_id, event_id, public_subdomain, custom_domain,
  domain_type, status, is_primary
)
values
  (null, null, null, 'easypassport.com.au', 'platform_marketing', 'active', false),
  (null, null, 'app', null,                  'platform_admin',     'active', false)
on conflict do nothing;
