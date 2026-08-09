// Reserve-then-send orchestration for one SMS campaign.
// Server-only. The browser never chooses the payment environment, the
// recipient list, or the credit cost.

import { getSupabaseAdmin, getSupabaseAsUser } from "@/integrations/supabase/admin.server";
import { dispatchSmsCampaign } from "@/lib/sms/dispatch.server";

export type SendCampaignResult =
  | {
      ok: true;
      campaign_id: string;
      recipients: number;
      credits_reserved: number;
      submitted: number;
      rejected: number;
      credits_returned: number;
      balance_credits: number | null;
    }
  | { ok: false; error: string; reason?: string; shortfall?: number };

async function resolvePaymentEnvironment(userId: string): Promise<"live" | "test"> {
  const admin = getSupabaseAdmin();
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const isPlatformAdmin = (roles ?? []).some((r) => r.role === "platform_admin");
  if (!isPlatformAdmin) return "live";
  const { data } = await admin
    .from("sms_provider_settings")
    .select("sms_payment_mode")
    .eq("id", true)
    .maybeSingle();
  return (data?.sms_payment_mode as string | undefined) === "test" ? "test" : "live";
}

export async function sendCampaign(input: {
  accessToken: string;
  agencyId: string;
  eventId: string;
  message: string;
  encoding: "GSM-7" | "UCS-2";
  segmentsPerRecipient: number;
  audienceKind: string;
  audienceParams: Record<string, string>;
  name: string | null;
}): Promise<SendCampaignResult> {
  const asUser = getSupabaseAsUser(input.accessToken);
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes?.user) {
    return { ok: false, error: "Not signed in. Please sign in and try again." };
  }

  const env = await resolvePaymentEnvironment(userRes.user.id);

  // Reserve as the user: membership, balance and double-spend protection all
  // live inside this single-transaction RPC.
  const { data: reserved, error: reserveErr } = await asUser.rpc(
    "sms_campaign_reserve_and_queue",
    {
      _agency_id: input.agencyId,
      _event_id: input.eventId,
      _message: input.message,
      _encoding: input.encoding,
      _segments_per_recipient: input.segmentsPerRecipient,
      _audience_kind: input.audienceKind,
      _audience_params: input.audienceParams,
      _name: input.name,
      _campaign_id: null,
      _payment_environment: env,
    },
  );

  if (reserveErr) {
    return { ok: false, error: reserveErr.message };
  }

  const result = (reserved ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    const reason = String(result.reason ?? "unknown");
    if (reason === "no_recipients") {
      return {
        ok: false,
        reason,
        error:
          "No eligible recipients. Participants need a valid mobile number and SMS consent, with no opt-out on record.",
      };
    }
    if (reason === "insufficient_credits") {
      const shortfall = Number(result.shortfall ?? 0);
      return {
        ok: false,
        reason,
        shortfall,
        error: `Not enough SMS credits — you need ${shortfall} more credit${shortfall === 1 ? "" : "s"} to send this message.`,
      };
    }
    return { ok: false, reason, error: `Could not queue this SMS (${reason}).` };
  }

  const campaignId = String(result.campaign_id ?? "");
  const recipients = Number(result.recipients ?? 0);
  const creditsReserved = Number(result.credits_required ?? result.credits_used ?? 0);

  const dispatch = await dispatchSmsCampaign(campaignId);

  // Re-read the balance after re-credits so the UI shows the true number.
  const admin = getSupabaseAdmin();
  const { data: account } = await admin
    .from("sms_credit_accounts")
    .select("balance_credits")
    .eq("agency_id", input.agencyId)
    .eq("payment_environment", env)
    .maybeSingle();

  if (!dispatch.ok && dispatch.submitted === 0) {
    return {
      ok: false,
      error: dispatch.error ?? "The SMS provider did not accept any messages. Credits were returned.",
    };
  }

  return {
    ok: true,
    campaign_id: campaignId,
    recipients,
    credits_reserved: creditsReserved,
    submitted: dispatch.submitted,
    rejected: dispatch.rejected,
    credits_returned: dispatch.credits_returned,
    balance_credits: account ? Number(account.balance_credits) : null,
  };
}
