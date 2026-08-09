import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, Send, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateSegments, SMS_MERGE_FIELDS, worstCaseSegments } from "@/lib/sms/segments";
import { sendSmsCampaign } from "@/lib/sms.functions";

type EventRow = { id: string; name: string };
type VenueRow = { id: string; name: string };

const AUDIENCES = [
  { value: "all_opted_in", label: "Everyone who opted in to SMS" },
  { value: "checked_in", label: "Participants who have checked in" },
  { value: "not_checked_in", label: "Participants who haven't checked in yet" },
  { value: "venue_visited", label: "Participants who visited a specific venue" },
] as const;

type AudienceKind = (typeof AUDIENCES)[number]["value"];

export function AdminSmsComposer({
  agencyId,
  balanceCredits,
  isTestMode,
  onSent,
}: {
  agencyId: string;
  balanceCredits: number;
  isTestMode: boolean;
  onSent: () => void;
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [venueId, setVenueId] = useState<string>("");
  const [audience, setAudience] = useState<AudienceKind>("all_opted_in");
  const [message, setMessage] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const rows = (data ?? []) as EventRow[];
      setEvents(rows);
      setEventId((prev) => prev || (rows[0]?.id ?? ""));
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("venues")
        .select("id, name")
        .eq("event_id", eventId)
        .eq("active", true)
        .order("name", { ascending: true });
      if (!cancelled) setVenues((data ?? []) as VenueRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const segments = useMemo(() => calculateSegments(message), [message]);
  const billedSegments = useMemo(
    () => worstCaseSegments(message, events.find((e) => e.id === eventId)?.name ?? "your event"),
    [message, events, eventId],
  );

  const refreshCount = useCallback(async () => {
    if (!eventId) return;
    if (audience === "venue_visited" && !venueId) {
      setRecipientCount(null);
      return;
    }
    setCounting(true);
    const { data, error } = await supabase.rpc("sms_audience_count", {
      _agency_id: agencyId,
      _event_id: eventId,
      _audience_kind: audience,
      _audience_params: audience === "venue_visited" ? { venue_id: venueId } : {},
    });
    setCounting(false);
    if (error) {
      setRecipientCount(null);
      toast.error(`Could not estimate the audience: ${error.message}`);
      return;
    }
    setRecipientCount(Number(data ?? 0));
  }, [agencyId, eventId, audience, venueId]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  const creditsNeeded = (recipientCount ?? 0) * billedSegments;
  const overBalance = creditsNeeded > balanceCredits;
  const canSend =
    !!eventId &&
    message.trim().length > 0 &&
    (recipientCount ?? 0) > 0 &&
    !overBalance &&
    !sending &&
    (audience !== "venue_visited" || !!venueId);

  const insertField = (field: string) => setMessage((prev) => `${prev}${field}`);

  const handleSend = async () => {
    const { data: sessionRes } = await supabase.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      toast.error("Your session expired. Please sign in again.");
      return;
    }
    const eventName = events.find((e) => e.id === eventId)?.name ?? "this event";
    if (
      !window.confirm(
        `Send this SMS to ${recipientCount} participant${recipientCount === 1 ? "" : "s"} of ${eventName}?\n\nThis will use ${creditsNeeded} credit${creditsNeeded === 1 ? "" : "s"} and cannot be undone.`,
      )
    ) {
      return;
    }

    setSending(true);
    try {
      const result = await sendSmsCampaign({
        data: {
          access_token: token,
          agency_id: agencyId,
          event_id: eventId,
          message,
          encoding: segments.encoding,
          segments_per_recipient: billedSegments,
          audience_kind: audience,
          audience_params: audience === "venue_visited" ? { venue_id: venueId } : {},
          name: `${eventName} — ${new Date().toLocaleString("en-AU")}`,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Sent to ${result.submitted} recipient${result.submitted === 1 ? "" : "s"}.${
          result.rejected > 0
            ? ` ${result.rejected} were rejected and ${result.credits_returned} credit(s) returned.`
            : ""
        }`,
      );
      setMessage("");
      onSent();
      void refreshCount();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send this SMS.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-5 rounded-[16px] border border-[#E6ECF4] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-[10px] bg-[#F1F5F9] p-2">
          <MessageSquare className="h-5 w-5 text-[#2F6FE4]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[#111827]">Send an SMS</h2>
          <p className="mt-1 text-sm leading-6 text-[#64748B]">
            {isTestMode
              ? "Test mode: credits come from your test balance. Messages are still delivered to real numbers, so keep the audience small."
              : "Messages go only to participants who opted in to SMS for the selected event."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-[#111827]">Event</span>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-[10px] border border-[#E6ECF4] bg-white px-3 py-2 text-sm text-[#111827]"
          >
            {events.length === 0 && <option value="">No events yet</option>}
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-[#111827]">Audience</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as AudienceKind)}
            className="w-full rounded-[10px] border border-[#E6ECF4] bg-white px-3 py-2 text-sm text-[#111827]"
          >
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        {audience === "venue_visited" && (
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-[#111827]">Venue</span>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full rounded-[10px] border border-[#E6ECF4] bg-white px-3 py-2 text-sm text-[#111827]"
            >
              <option value="">Choose a venue…</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-[#111827]">Message</span>
          <div className="flex flex-wrap gap-1.5">
            {SMS_MERGE_FIELDS.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => insertField(field)}
                className="rounded-full border border-[#E6ECF4] px-2.5 py-1 text-xs text-[#2F6FE4] hover:bg-[#F8FAFC]"
              >
                {field}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={1600}
          placeholder="Hi {first_name}, there's still time to collect stamps at {event_name}. Open your passport: {link}"
          className="w-full rounded-[10px] border border-[#E6ECF4] bg-white px-3 py-2 text-sm leading-6 text-[#111827]"
        />
        <p className="text-xs text-[#64748B]">
          {segments.characters} characters · {segments.encoding} · {billedSegments} segment
          {billedSegments === 1 ? "" : "s"} billed per recipient. Add “Reply STOP to opt out” if your
          sender supports replies.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-[#F8FAFC] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[#334155]">
          <Users className="h-4 w-4 text-[#2F6FE4]" />
          {counting ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Estimating audience…
            </span>
          ) : recipientCount === null ? (
            <span>Choose an event and audience to see the estimate.</span>
          ) : (
            <span>
              <strong>{recipientCount}</strong> eligible recipient
              {recipientCount === 1 ? "" : "s"} · <strong>{creditsNeeded}</strong> credit
              {creditsNeeded === 1 ? "" : "s"} needed
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#2F6FE4] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send SMS"}
        </button>
      </div>

      {overBalance && (
        <p className="text-sm text-[#B42318]">
          This send needs {creditsNeeded} credits but your balance is {balanceCredits}. Buy a pack above
          to continue.
        </p>
      )}

      <div className="flex items-center gap-2 rounded-[10px] bg-[#F8FAFC] px-3 py-2 text-xs text-[#64748B]">
        <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
        Only participants who explicitly opted in to SMS are ever included, and STOP replies opt them
        out immediately.
      </div>
    </section>
  );
}
