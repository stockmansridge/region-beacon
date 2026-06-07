import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { RESERVED_SUBDOMAINS } from "@/lib/reserved-subdomains";

function supabaseProjectRef(): string {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] ?? "(unknown)";
  } catch {
    return "(unparseable)";
  }
}

export const PENDING_ORG_SIGNUP_KEY = "getstampd:pending-organisation-signup";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export type PendingOrganisationSignup = {
  businessName: string;
  organisationUrlName?: string;
  intention?: string;
  email: string;
  createdAt: string;
  source: string;
  lastError?: string | null;
};

type SupabaseRpcError = { message?: string; code?: string } | null;

export const LAST_ORG_SIGNUP_ERROR_KEY = "getstampd:last-organisation-signup-error";

export function readLastOrganisationSignupError(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(LAST_ORG_SIGNUP_ERROR_KEY);
  } catch {
    return null;
  }
}

export function writeLastOrganisationSignupError(message: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (message) window.localStorage.setItem(LAST_ORG_SIGNUP_ERROR_KEY, message);
    else window.localStorage.removeItem(LAST_ORG_SIGNUP_ERROR_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Maximum base-slug length. The DB constraint allows up to 63 chars total
 * (DNS-label shape). We cap the base at 60 so that retry suffixes like "-99"
 * still fit within the 63-char hard limit.
 */
export const MAX_AGENCY_SLUG_LENGTH = 63;
const MAX_AGENCY_BASE_SLUG_LENGTH = 60;

/**
 * Sanitises a candidate string into a slug that satisfies
 * `agencies_slug_public_subdomain_check`:
 *   - lowercase a-z 0-9 hyphen
 *   - must start and end with [a-z0-9]
 *   - no leading/trailing/double hyphens
 *   - length 1..maxLength
 *   - not a reserved subdomain
 *
 * Returns "" if nothing valid can be produced; callers should fall back.
 */
export function sanitiseAgencySlug(
  input: string,
  maxLength: number = MAX_AGENCY_BASE_SLUG_LENGTH,
): string {
  if (!input) return "";
  let s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, Math.max(1, maxLength))
    .replace(/^-+|-+$/g, "");
  if (!s) return "";
  if (RESERVED_SUBDOMAINS.has(s)) {
    const suffixed = `${s}-org`.slice(0, maxLength).replace(/-+$/g, "");
    s = suffixed || "";
  }
  return s;
}

export function isValidAgencySlug(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length < 1 || s.length > MAX_AGENCY_SLUG_LENGTH) return false;
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) return false;
  if (RESERVED_SUBDOMAINS.has(s)) return false;
  return true;
}

export function slugifyOrganisationName(name: string): string {
  return sanitiseAgencySlug(name || "") || "organisation";
}


function storageAvailable(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savePendingOrganisationSignup(
  input: Omit<PendingOrganisationSignup, "createdAt" | "source"> & {
    source?: string;
  },
): boolean {
  const ls = storageAvailable();
  if (!ls) return false;
  try {
    const payload: PendingOrganisationSignup = {
      businessName: input.businessName,
      organisationUrlName: input.organisationUrlName,
      intention: input.intention,
      email: input.email,
      createdAt: new Date().toISOString(),
      source: input.source ?? "signup",
    };
    ls.setItem(PENDING_ORG_SIGNUP_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export async function savePendingOrganisationSignupServer(input: {
  email: string;
  fullName?: string | null;
  businessName: string;
  organisationUrlName?: string | null;
  intention?: string | null;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: { message: string; code?: string } }> {
  const { data, error } = await supabase.rpc("save_pending_organisation_signup", {
    _email: input.email,
    _full_name: input.fullName ?? null,
    _organisation_name: input.businessName,
    _organisation_slug: input.organisationUrlName ?? null,
    _signup_intention: input.intention ?? null,
  });
  if (error) return { ok: false, error };
  return { ok: true, id: (data as string | null) ?? null };
}

export async function getMyPendingOrganisationSignupServer(): Promise<PendingOrganisationSignup | null> {
  const { data, error } = await supabase.rpc("get_my_pending_organisation_signup");
  if (error) {
    const msg = error.message || "";
    if (!/not_authenticated|pending_organisation_signup_not_found/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn("[org-signup] get_my_pending_organisation_signup failed", {
        code: error.code,
        message: error.message,
      });
    }
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  const pending = row as {
    email: string;
    organisation_name: string;
    organisation_slug: string | null;
    signup_intention: string | null;
    created_at: string;
    last_error: string | null;
  };
  return {
    businessName: pending.organisation_name,
    organisationUrlName: pending.organisation_slug ?? undefined,
    intention: pending.signup_intention ?? undefined,
    email: pending.email,
    createdAt: pending.created_at,
    source: "server",
    lastError: pending.last_error,
  };
}

export async function completePendingOrganisationSignupServer(): Promise<CompletePendingResult> {
  const { data, error } = await supabase.rpc("complete_pending_organisation_signup");
  if (!error) {
    if (!data) {
      const pending = await getMyPendingOrganisationSignupServer();
      return {
        ok: false,
        code: "completion_failed",
        message:
          pending?.lastError ||
          "We could not finish creating your organisation. Please try again, or contact support if it continues.",
      };
    }
    clearPendingOrganisationSignup();
    return { ok: true };
  }
  // eslint-disable-next-line no-console
  console.warn("[org-signup] complete_pending_organisation_signup failed", {
    projectRef: supabaseProjectRef(),
    code: error.code,
    message: error.message,
  });
  return mapOrganisationCompletionError(error);
}

// Convenience fallback only. The production source of truth is the server-side
// pending_organisation_signups row; localStorage helps same-browser retries but
// must never be required for email confirmation completion.
export function readPendingOrganisationSignup(): PendingOrganisationSignup | null {
  const ls = storageAvailable();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PENDING_ORG_SIGNUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOrganisationSignup>;
    if (
      !parsed ||
      typeof parsed.businessName !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      ls.removeItem(PENDING_ORG_SIGNUP_KEY);
      return null;
    }

    const age = Date.now() - new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      ls.removeItem(PENDING_ORG_SIGNUP_KEY);
      return null;
    }
    return {
      businessName: parsed.businessName,
      organisationUrlName: parsed.organisationUrlName,
      intention: parsed.intention,
      email: parsed.email ?? "",
      createdAt: parsed.createdAt,
      source: parsed.source ?? "signup",
    };
  } catch {
    return null;
  }
}

export function clearPendingOrganisationSignup(): void {
  const ls = storageAvailable();
  if (!ls) return;
  try {
    ls.removeItem(PENDING_ORG_SIGNUP_KEY);
    ls.removeItem(LAST_ORG_SIGNUP_ERROR_KEY);
  } catch {
    /* ignore */
  }
}

export type CompletePendingResult =
  | { ok: true; alreadyHadOrganisation?: boolean }
  | {
      ok: false;
      code: string;
      message: string;
      currentEmail?: string;
      pendingEmail?: string;
    };

export const ORG_SIGNUP_SERVER_SETUP_ERROR =
  "We could not create the organisation because the server setup is incomplete. Please contact support.";

export function isOrganisationSignupServerSetupError(message: string): boolean {
  return /PGRST202|schema cache|Could not find the function|function .* does not exist/i.test(message);
}

function mapOrganisationCompletionError(rpcErr: SupabaseRpcError): CompletePendingResult {
  const msg = rpcErr?.message || "";
  if (/pending_organisation_signup_not_found/i.test(msg)) {
    return { ok: false, code: "no_pending", message: "No pending organisation signup found." };
  }
  if (/agencies_slug_public_subdomain_check|agency_slug_invalid|invalid_agency_slug/i.test(msg)) {
    return {
      ok: false,
      code: "invalid_slug",
      message:
        "We could not finish creating your organisation because the generated organisation URL was invalid. Please try again, or contact support if it continues.",
    };
  }
  if (/agency_slug_unavailable/i.test(msg)) {
    return {
      ok: false,
      code: "slug_unavailable",
      message:
        "Could not find an available Organisation URL name. Please try a different organisation name.",
    };
  }
  if (/invalid_agency_name|invalid_pending_signup_organisation_name/i.test(msg)) {
    return { ok: false, code: "invalid_name", message: "Organisation name is invalid." };
  }
  if (/not_authenticated/i.test(msg)) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "You must be signed in to finish creating your organisation.",
    };
  }
  if (/permission denied|forbidden/i.test(msg)) {
    return {
      ok: false,
      code: "permission_denied",
      message: "Permission denied creating organisation. Please contact support.",
    };
  }
  if (/pending_organisation_signup_completion_failed/i.test(msg)) {
    return {
      ok: false,
      code: "completion_failed",
      message:
        "We could not finish creating your organisation. Please try again, or contact support if it continues.",
    };
  }
  if (isOrganisationSignupServerSetupError(msg)) {
    return {
      ok: false,
      code: "rpc_missing",
      message: ORG_SIGNUP_SERVER_SETUP_ERROR,
    };
  }
  return { ok: false, code: "rpc_error", message: msg || "Could not create organisation." };
}

/**
 * Completes pending organisation signup for the currently authenticated user.
 * Safe to call multiple times — if the user already has a membership, this
 * clears the pending entry and returns ok.
 *
 * REFUSES to run if the signed-in user's email does not match the email
 * the pending signup was created for. This prevents a new organisation
 * being attached to the wrong existing account.
 */
export async function completePendingOrganisationSignup(): Promise<CompletePendingResult> {
  const serverResult = await completePendingOrganisationSignupServer();
  if (serverResult.ok || serverResult.code !== "no_pending") {
    return serverResult;
  }

  const pending = readPendingOrganisationSignup();
  if (!pending) {
    return { ok: false, code: "no_pending", message: "No pending organisation signup found." };
  }

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) {
    // eslint-disable-next-line no-console
    console.warn("[org-signup] not authenticated when completing", userErr);
    return {
      ok: false,
      code: "not_authenticated",
      message: "You must be signed in to finish creating your organisation.",
    };
  }
  const userId = userRes.user.id;
  const currentEmail = (userRes.user.email ?? "").toLowerCase().trim();
  const pendingEmail = (pending.email ?? "").toLowerCase().trim();

  // Wrong-session protection: don't attach a new organisation to a different
  // existing user.
  if (pendingEmail && currentEmail && currentEmail !== pendingEmail) {
    return {
      ok: false,
      code: "email_mismatch",
      message:
        `You're signed in as ${userRes.user.email}, but this organisation signup was created for ${pending.email}. Sign out and sign in with the correct account to finish creating the organisation.`,
      currentEmail: userRes.user.email ?? "",
      pendingEmail: pending.email,
    };
  }

  const serverSave = await savePendingOrganisationSignupServer({
    email: currentEmail || pending.email,
    fullName: userRes.user.user_metadata?.full_name as string | undefined,
    businessName: pending.businessName,
    organisationUrlName: pending.organisationUrlName,
    intention: pending.intention,
  });
  if (serverSave.ok) {
    const retryServerResult = await completePendingOrganisationSignupServer();
    if (retryServerResult.ok || retryServerResult.code !== "no_pending") {
      return retryServerResult;
    }
  } else if (!isOrganisationSignupServerSetupError(serverSave.error.message || "")) {
    // eslint-disable-next-line no-console
    console.warn("[org-signup] fallback save_pending_organisation_signup failed", {
      code: serverSave.error.code,
      message: serverSave.error.message,
    });
  }

  // If the user already has a membership, just clear and succeed.
  const { data: existing, error: existingErr } = await supabase
    .from("agency_members")
    .select("agency_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .limit(1);

  if (!existingErr && existing && existing.length > 0) {
    clearPendingOrganisationSignup();
    return { ok: true, alreadyHadOrganisation: true };
  }

  const rawBase = (pending.organisationUrlName && pending.organisationUrlName.trim())
    ? pending.organisationUrlName.trim()
    : pending.businessName;
  const baseSlug = sanitiseAgencySlug(rawBase) || slugifyOrganisationName(pending.businessName);

  // eslint-disable-next-line no-console
  console.log("[signup-completion] generated slug", {
    organisationName: pending.businessName,
    rawBase,
    baseSlug,
    valid: isValidAgencySlug(baseSlug),
  });

  const { error: rpcErr } = await createAgencyWithSlugRetry(
    pending.businessName,
    baseSlug,
    50,
    pending.intention,
  );

  if (rpcErr) {
    // eslint-disable-next-line no-console
    console.warn("[org-signup] create_customer_agency failed", {
      projectRef: supabaseProjectRef(),
      code: rpcErr.code,
      message: rpcErr.message,
    });
    const msg = rpcErr.message || "";
    if (/agencies_slug_public_subdomain_check|agency_slug_invalid|invalid_agency_slug/i.test(msg)) {
      return {
        ok: false,
        code: "invalid_slug",
        message:
          "We could not finish creating your organisation because the generated organisation URL was invalid. Please try again, or contact support if it continues.",
      };
    }
    if (/invalid_agency_name/i.test(msg)) {
      return { ok: false, code: "invalid_name", message: "Organisation name is invalid." };
    }
    if (/not_authenticated/i.test(msg)) {
      return {
        ok: false,
        code: "not_authenticated",
        message: "Sign-in did not persist. Please sign in again.",
      };
    }
    if (/permission denied/i.test(msg)) {
      return {
        ok: false,
        code: "permission_denied",
        message: "Permission denied creating organisation. Please contact support.",
      };
    }
    if (isOrganisationSignupServerSetupError(msg)) {
      return {
        ok: false,
        code: "rpc_missing",
        message: ORG_SIGNUP_SERVER_SETUP_ERROR,
      };
    }
    return { ok: false, code: "rpc_error", message: msg || "Could not create organisation." };
  }

  clearPendingOrganisationSignup();
  return { ok: true };
}

/**
 * Creates an organisation, automatically appending -2, -3, ... to the slug
 * if the requested slug is taken. Slug conflicts must not block signup.
 *
 * Every candidate is re-sanitised so it satisfies the DB
 * `agencies_slug_public_subdomain_check` constraint (length, charset,
 * leading/trailing hyphens, reserved labels).
 */
export async function createAgencyWithSlugRetry(
  agencyName: string,
  baseSlug: string,
  maxAttempts = 50,
  signupIntention?: string | null,
): Promise<{ error: { message: string; code?: string } | null; slug?: string }> {
  const safeBase =
    sanitiseAgencySlug(baseSlug) ||
    sanitiseAgencySlug(agencyName) ||
    "organisation";
  const intention = (signupIntention ?? "").trim() || null;

  for (let i = 0; i < maxAttempts; i++) {
    const suffix = i === 0 ? "" : `-${i + 1}`;
    const room = Math.max(1, MAX_AGENCY_SLUG_LENGTH - suffix.length);
    const trimmedBase = safeBase.slice(0, room).replace(/-+$/g, "") || "organisation";
    const candidate = sanitiseAgencySlug(`${trimmedBase}${suffix}`, MAX_AGENCY_SLUG_LENGTH);

    if (!candidate || !isValidAgencySlug(candidate)) {
      // eslint-disable-next-line no-console
      console.warn("[signup-completion] skipping invalid candidate slug", {
        attempt: i,
        candidate,
        safeBase,
      });
      continue;
    }

    const { error } = await supabase.rpc("create_customer_agency", {
      _agency_name: agencyName,
      _agency_slug: candidate,
      _signup_intention: intention,
    });
    if (!error) return { error: null, slug: candidate };
    if (!/agency_slug_taken/i.test(error.message || "")) {
      return { error };
    }
  }
  return {
    error: {
      message:
        "Could not find an available Organisation URL name. Please try a different organisation name.",
    },
  };
}

