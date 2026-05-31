import { supabase } from "@/integrations/supabase/client";
import { PRIMARY_ROOT_DOMAIN, ROOT_DOMAINS } from "@/lib/domains";

/**
 * Tenant resolution helpers used by the public agency workspace and event
 * pages. These are client-side reads against public RPCs (SECURITY DEFINER)
 * that scope output to safe public columns only — no broad SELECT policy
 * on `agencies` is added.
 *
 * RPCs (defined in supabase/migrations-draft-tenant-routing/):
 *   - resolve_agency_by_subdomain(_sub text)
 *       returns (agency_id uuid, name text, slug text)
 *   - get_public_event_by_agency_and_slug(_sub text, _event_slug text)
 *       returns same shape as get_public_event_by_domain
 *
 * Until the migration is applied these RPCs return errors; callers must
 * degrade to a "not found" state and NOT crash. The legacy
 * `resolve_event_by_host` RPC continues to back `/live/$subdomain`.
 */

export type PublicAgency = {
  agency_id: string;
  name: string;
  slug: string;
};

export async function resolveAgencyBySubdomain(sub: string): Promise<PublicAgency | null> {
  try {
    const { data, error } = await supabase.rpc("resolve_agency_by_subdomain", { _sub: sub });
    if (error || !data || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as PublicAgency;
    if (!row?.agency_id) return null;
    return row;
  } catch {
    return null;
  }
}

/** Tries each known root domain for legacy `event_domains` rows. */
export async function resolveLegacyEventForSubdomain(
  sub: string,
): Promise<{ event_id: string } | null> {
  const tried = new Set<string>();
  for (const root of ROOT_DOMAINS) {
    const host = `${sub}.${root}`;
    if (tried.has(host)) continue;
    tried.add(host);
    try {
      const { data, error } = await supabase.rpc("resolve_event_by_host", { _hostname: host });
      if (error) continue;
      const row = (data?.[0] ?? null) as { kind?: string; event_id?: string | null } | null;
      if (row?.kind === "event" && row.event_id) return { event_id: row.event_id };
    } catch {
      // try next variant
    }
  }
  return null;
}

export function tenantHostFor(sub: string): string {
  return `${sub}.${PRIMARY_ROOT_DOMAIN}`;
}
