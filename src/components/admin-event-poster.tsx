import { useState } from "react";
import { toast } from "sonner";
import {
  eventPosterFilename,
  generateEventPosterPdf,
  type EventPosterInput,
} from "@/lib/event-poster";

type Props = {
  canEdit: boolean;
  event: {
    name: string;
    slug: string;
    public_slug: string | null;
    description: string | null;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string | null;
  };
  branding: {
    logo_path: string | null;
    cover_path: string | null;
    primary_color: string | null;
    accent_color: string | null;
    welcome_copy: string | null;
  } | null;
  logoUrl: string | null;
  coverUrl: string | null;
  activePublicSubdomain: string | null;
};

export function AdminEventPoster({
  canEdit,
  event,
  branding,
  logoUrl,
  coverUrl,
  activePublicSubdomain,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!canEdit) return null;

  const hasActiveSubdomain = !!activePublicSubdomain;
  const publicUrl = hasActiveSubdomain
    ? `https://${activePublicSubdomain}.getstampd.com.au`
    : null;
  const filename = eventPosterFilename(event.public_slug ?? event.slug);

  async function onDownload() {
    if (!publicUrl) return;
    setBusy(true);
    try {
      const input: EventPosterInput = {
        eventName: event.name,
        publicUrl,
        description: event.description,
        welcomeCopy: branding?.welcome_copy ?? null,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        timezone: event.timezone,
        logoUrl,
        coverUrl,
        primaryColor: branding?.primary_color ?? null,
        accentColor: branding?.accent_color ?? null,
      };
      await generateEventPosterPdf(input, filename);
    } catch (err) {
      console.error("[event-poster]", err);
      toast.error("Could not generate poster. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onCopyStartLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Event start link copied.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <section className="rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Event start QR (poster)</h3>
            <span className="inline-flex items-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#1D4ED8]">
              For posters &amp; signage
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Print this QR on posters, flyers, and event signage. Visitors scan it
            to <strong>start or open their passport</strong>. This is{" "}
            <strong>not</strong> a venue check-in QR — venue QRs are generated
            per venue and record stamps/points.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopyStartLink}
            disabled={!hasActiveSubdomain}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-3.5 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy event start link"}
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!hasActiveSubdomain || busy}
            className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Generating…" : "Download event poster PDF"}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] px-4 py-3 text-xs leading-5 text-[#334155]">
        {hasActiveSubdomain ? (
          <>
            <span className="font-medium text-muted-foreground">
              Event start QR opens:{" "}
            </span>
            <code className="break-all">{publicUrl}</code>
          </>
        ) : (
          <span className="text-muted-foreground">
            Activate a public address before downloading the event start QR.
          </span>
        )}
      </div>

      {/* Visitor flow explainer — keeps poster/venue/passport distinctions
          obvious so organisers don't print the wrong QR. */}
      <ol className="mt-4 space-y-2 rounded-[12px] border border-[#E6ECF4] bg-white px-4 py-3 text-xs leading-5 text-[#334155]">
        <li className="flex gap-2">
          <span className="font-semibold text-[#1D4ED8]">1.</span>
          <span>
            <strong>Print/share the Event start QR</strong> on posters, flyers,
            and signage at the gate.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-[#1D4ED8]">2.</span>
          <span>
            <strong>Visitor scans the start QR</strong> → creates or opens their
            passport.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-[#1D4ED8]">3.</span>
          <span>
            <strong>At each venue</strong>, the visitor scans that
            <strong> Venue check-in QR</strong> to collect a stamp and points.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-[#1D4ED8]">4.</span>
          <span>
            Points update rewards and the leaderboard automatically.
          </span>
        </li>
      </ol>

      {hasActiveSubdomain && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          File: <code>{filename}</code>
        </p>
      )}
    </section>
  );
}
