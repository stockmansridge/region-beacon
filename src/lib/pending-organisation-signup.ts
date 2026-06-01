import { supabase } from "@/integrations/supabase/client";

export const PENDING_ORG_SIGNUP_KEY = "getstampd:pending-organisation-signup";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export type PendingOrganisationSignup = {
  businessName: string;
  organisationUrlName: string;
  email: string;
  createdAt: string;
  source: string;
};

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
      typeof parsed.organisationUrlName !== "string" ||
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

  const { error: rpcErr } = await supabase.rpc("create_customer_agency", {
    _agency_name: pending.businessName,
    _agency_slug: pending.organisationUrlName,
  });

  if (rpcErr) {
    const msg = rpcErr.message || "";
    if (/agency_slug_taken/i.test(msg)) {
      return {
        ok: false,
        code: "slug_taken",
        message:
          "That Organisation URL name is already taken. Please choose another.",
      };
    }
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
    if (/Could not find the function|function .* does not exist/i.test(msg)) {
      return {
        ok: false,
        code: "rpc_missing",
        message:
          "Self-service organisation creation is not enabled on this environment. Please contact support.",
      };
    }
    return { ok: false, code: "rpc_error", message: msg || "Could not create organisation." };
  }

  clearPendingOrganisationSignup();
  return { ok: true };
}
