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

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Event poster</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Printable A4 poster with a QR code linking to your public event page.
            Generated in your browser — nothing is uploaded.
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={!hasActiveSubdomain || busy}
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Generating…" : "Download poster PDF"}
        </button>
      </div>

      <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        {hasActiveSubdomain ? (
          <>
            <span className="font-medium text-muted-foreground">QR target: </span>
            <code className="break-all">{publicUrl}</code>
          </>
        ) : (
          <span className="text-muted-foreground">
            Activate a public address before downloading the event poster.
          </span>
        )}
      </div>

      {hasActiveSubdomain && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          File: <code>{filename}</code>
        </p>
      )}
    </section>
  );
}
