// Campaign dispatcher. Reads a queued campaign, personalises each message and
// submits it to ClickSend in batches, marking every recipient row before
// moving on so a re-run never double-sends.
//
// Server-only. Credits are reserved BEFORE this runs (sms_campaign_reserve_and_queue),
// and any segments that could not be submitted are re-credited here.

import { getSupabaseAdmin } from "@/integrations/supabase/admin.server";
import {
  getClickSendConfig,
  sendSmsBatch,
  type SmsSendResult,
} from "@/lib/sms/clicksend.server";
import { applyMergeFields } from "@/lib/sms/segments";

const BATCH_SIZE = 200;

export type DispatchResult = {
  ok: boolean;
  campaign_id: string;
  submitted: number;
  rejected: number;
  credits_returned: number;
  error?: string;
};

type CampaignRow = {
  id: string;
  agency_id: string;
  event_id: string;
  message: string;
  status: string;
  sms_segments_per_recipient: number;
};

type RecipientRow = {
  id: string;
  visitor_id: string | null;
  phone_e164: string;
  status: string;
};

/** Public event URL used for the {link} merge field. */
async function resolveEventLink(eventId: string): Promise<{ link: string; name: string }> {
  const admin = getSupabaseAdmin();
  const [{ data: evt }, { data: dom }] = await Promise.all([
    admin.from("events").select("name").eq("id", eventId).maybeSingle(),
    admin
      .from("event_domains")
      .select("public_subdomain, status")
      .eq("event_id", eventId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  const subdomain = (dom?.public_subdomain as string | null) ?? null;
  return {
    name: (evt?.name as string | null) ?? "your event",
    link: subdomain ? `https://${subdomain}.getstampd.com.au` : "https://getstampd.com.au",
  };
}

export async function dispatchSmsCampaign(campaignId: string): Promise<DispatchResult> {
  const admin = getSupabaseAdmin();

  const { data: campaignRaw, error: campErr } = await admin
    .from("sms_campaigns")
    .select("id, agency_id, event_id, message, status, sms_segments_per_recipient")
    .eq("id", campaignId)
    .maybeSingle();
  if (campErr || !campaignRaw) {
    return {
      ok: false,
      campaign_id: campaignId,
      submitted: 0,
      rejected: 0,
      credits_returned: 0,
      error: "Campaign not found.",
    };
  }
  const campaign = campaignRaw as CampaignRow;

  if (!["queued", "sending"].includes(campaign.status)) {
    return {
      ok: false,
      campaign_id: campaignId,
      submitted: 0,
      rejected: 0,
      credits_returned: 0,
      error: `Campaign is ${campaign.status}, not queued.`,
    };
  }

  const config = getClickSendConfig();
  if (!config) {
    await admin
      .from("sms_campaigns")
      .update({
        status: "failed",
        error_message:
          "SMS provider is not configured. Set CLICKSEND_USERNAME, CLICKSEND_API_KEY and CLICKSEND_SENDER.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    const returned = await recreditUnsent(campaignId, campaign.sms_segments_per_recipient);
    return {
      ok: false,
      campaign_id: campaignId,
      submitted: 0,
      rejected: 0,
      credits_returned: returned,
      error: "SMS provider is not configured.",
    };
  }

  await admin.from("sms_campaigns").update({ status: "sending" }).eq("id", campaignId);

  const { name: eventName, link } = await resolveEventLink(campaign.event_id);

  const { data: recipientsRaw, error: recErr } = await admin
    .from("sms_campaign_recipients")
    .select("id, visitor_id, phone_e164, status")
    .eq("campaign_id", campaignId)
    .eq("status", "queued");
  if (recErr) {
    return {
      ok: false,
      campaign_id: campaignId,
      submitted: 0,
      rejected: 0,
      credits_returned: 0,
      error: "Could not load recipients.",
    };
  }
  const recipients = (recipientsRaw ?? []) as RecipientRow[];

  // First names for {first_name}. One query, not one per recipient.
  const visitorIds = recipients.map((r) => r.visitor_id).filter((v): v is string => !!v);
  const firstNames = new Map<string, string>();
  if (visitorIds.length > 0) {
    const { data: visitors } = await admin
      .from("visitors")
      .select("id, first_name")
      .in("id", visitorIds);
    for (const v of visitors ?? []) {
      firstNames.set(String(v.id), (v.first_name as string | null) ?? "");
    }
  }

  let submitted = 0;
  let rejected = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const slice = recipients.slice(i, i + BATCH_SIZE);
    const messages = slice.map((r) => ({
      to: r.phone_e164,
      reference: r.id,
      body: applyMergeFields(campaign.message, {
        first_name: r.visitor_id ? firstNames.get(r.visitor_id) : null,
        event_name: eventName,
        link,
      }),
    }));

    let results: SmsSendResult[];
    try {
      results = await sendSmsBatch(config, messages);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[sms-dispatch] batch threw", detail);
      results = messages.map((m) => ({
        to: m.to,
        ok: false,
        providerMessageId: null,
        status: "rejected",
        error: detail.slice(0, 300),
      }));
    }

    for (let j = 0; j < slice.length; j += 1) {
      const row = slice[j]!;
      const result = results[j];
      const ok = result?.ok === true;
      if (ok) submitted += 1;
      else rejected += 1;
      await admin
        .from("sms_campaign_recipients")
        .update({
          status: ok ? "submitted" : "rejected",
          provider_message_id: result?.providerMessageId ?? null,
          failure_reason: ok ? null : (result?.error ?? "Unknown provider error"),
          credits_used: ok ? campaign.sms_segments_per_recipient : 0,
        })
        .eq("id", row.id);
    }
  }

  const creditsReturned = await recreditUnsent(campaignId, campaign.sms_segments_per_recipient);

  const status = submitted === 0 ? "failed" : rejected > 0 ? "partially_failed" : "completed";
  await admin
    .from("sms_campaigns")
    .update({
      status,
      credits_used: submitted * campaign.sms_segments_per_recipient,
      completed_at: new Date().toISOString(),
      error_message:
        rejected > 0 ? `${rejected} recipient(s) were rejected by the SMS provider.` : null,
    })
    .eq("id", campaignId);

  console.log(
    `[sms-dispatch] campaign=${campaignId} submitted=${submitted} rejected=${rejected} recredited=${creditsReturned}`,
  );

  return {
    ok: submitted > 0,
    campaign_id: campaignId,
    submitted,
    rejected,
    credits_returned: creditsReturned,
  };
}

/** Returns credits for every recipient that never reached the provider. */
async function recreditUnsent(campaignId: string, segments: number): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("sms_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "rejected"]);
  const unsent = count ?? 0;
  if (unsent === 0) return 0;
  const credits = unsent * segments;
  const { error } = await admin.rpc("sms_campaign_recredit", {
    _campaign_id: campaignId,
    _credits: credits,
    _reason: "Segments returned for SMS that were never accepted by the provider",
  });
  if (error) {
    console.error("[sms-dispatch] recredit failed", error.message);
    return 0;
  }
  return credits;
}
