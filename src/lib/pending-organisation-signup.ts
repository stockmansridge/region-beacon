import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";

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
};

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

export function slugifyOrganisationName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "organisation";
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

  const baseSlug = (pending.organisationUrlName && pending.organisationUrlName.trim())
    ? pending.organisationUrlName.trim().toLowerCase()
    : slugifyOrganisationName(pending.businessName);

  const { error: rpcErr } = await createAgencyWithSlugRetry(pending.businessName, baseSlug);

  if (rpcErr) {
    // eslint-disable-next-line no-console
    console.warn("[org-signup] create_customer_agency failed", {
      projectRef: supabaseProjectRef(),
      code: rpcErr.code,
      message: rpcErr.message,
    });
    const msg = rpcErr.message || "";
    if (/invalid_agency_slug/i.test(msg)) {
      return { ok: false, code: "invalid_slug", message: "Organisation URL name is invalid." };
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
 */
export async function createAgencyWithSlugRetry(
  agencyName: string,
  baseSlug: string,
  maxAttempts = 50,
): Promise<{ error: { message: string; code?: string } | null; slug?: string }> {
  const base = baseSlug && baseSlug.length >= 2 ? baseSlug : slugifyOrganisationName(agencyName);
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`.slice(0, 60);
    const { error } = await supabase.rpc("create_customer_agency", {
      _agency_name: agencyName,
      _agency_slug: candidate,
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

