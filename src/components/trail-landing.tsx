import { ReactNode } from "react";
import { DEFAULT_VENUE_LABEL_PLURAL } from "@/lib/venue-labels";

const DEFAULT_HERO =
  "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=70";

export type TrailLandingProps = {
  eventName: string;
  monogram?: string;
  subtitle?: string;
  pitch?: string;
  welcomeCopy?: string;
  primaryColor?: string;
  accentColor?: string;
  goldColor?: string;
  fontFamily?: string;
  /** Heading font for the hero event title. Falls back to fontFamily. */
  headingFontFamily?: string;
  heroImageUrl?: string | null;
  logoUrl?: string | null;
  venueCount?: number;
  venueNames?: string[];
  venueLabelPlural?: string;
  termsUrl?: string | null;
  primaryCta?: ReactNode;
  secondaryCta?: ReactNode;
  badge?: string;
  noAppNote?: string;
  footer?: ReactNode;
  /** Hex colour painted over the hero image. Defaults to `primaryColor`. */
  heroOverlayColor?: string | null;
  /** 0–100. When provided, replaces the default 3-stop gradient with a flat
   *  overlay of `heroOverlayColor` at this opacity. */
  heroOverlayOpacity?: number | null;
};

export function TrailLanding({
  eventName,
  monogram,
  subtitle = "Digital Passport",
  pitch,
  welcomeCopy,
  primaryColor = "#1F3D2B",
  accentColor = "#B5572A",
  goldColor = "#C9A24A",
  fontFamily,
  headingFontFamily,
  heroImageUrl,
  logoUrl,
  venueCount,
  venueNames,
  venueLabelPlural = DEFAULT_VENUE_LABEL_PLURAL,
  termsUrl,
  primaryCta,
  secondaryCta,
  badge,
  noAppNote = "No app download required",
  footer,
  heroOverlayColor,
  heroOverlayOpacity,
}: TrailLandingProps) {
  const initials = (monogram ?? eventName)
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const hero = heroImageUrl ?? DEFAULT_HERO;

  // Hero overlay: if the event sets a custom overlay colour/opacity, paint
  // a flat tint. Otherwise fall back to the legacy 3-stop gradient so
  // unbranded events look identical.
  const overlayBaseColor = heroOverlayColor && /^#[0-9A-Fa-f]{6}$/.test(heroOverlayColor)
    ? heroOverlayColor
    : primaryColor;
  const overlayOpacity =
    typeof heroOverlayOpacity === "number" && Number.isFinite(heroOverlayOpacity)
      ? Math.max(0, Math.min(1, heroOverlayOpacity / 100))
      : null;
  const overlayStyle: React.CSSProperties =
    overlayOpacity !== null
      ? { backgroundColor: overlayBaseColor, opacity: overlayOpacity }
      : {
          background: `linear-gradient(180deg, ${primaryColor}33 0%, ${primaryColor}AA 60%, ${primaryColor}F0 100%)`,
        };

  const rootStyle: React.CSSProperties = {
    ...(fontFamily ? { fontFamily, ["--event-font" as any]: fontFamily } : {}),
    ...(headingFontFamily ? { ["--event-heading-font" as any]: headingFontFamily } : {}),
  };

  return (
    <div className="mx-auto w-full max-w-md" style={rootStyle}>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[28px] shadow-[0_24px_60px_-30px_rgba(31,61,43,0.45)]">
        <div className="relative h-[360px] w-full">
          {hero ? (
            <img
              src={hero}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          <div className="absolute inset-0" style={overlayStyle} />

          {badge && (
            <div
              className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--event-primary-fg,#F6EFE2)]"
              style={{ backgroundColor: `${accentColor}E6` }}
            >
              <span className="h-1 w-1 rounded-full bg-[var(--event-primary-fg,#F6EFE2)]" />
              {badge}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-7 text-center text-[var(--event-primary-fg,#F6EFE2)]">
            {logoUrl ? (
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                style={{ background: "transparent" }}
              >
                <img
                  src={logoUrl}
                  alt=""
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border text-sm font-semibold tracking-[0.2em]"
                style={{
                  borderColor: `${goldColor}80`,
                  backgroundColor: `${primaryColor}AA`,
                  color: goldColor,
                }}
              >
                {initials}
              </div>
            )}
            <div className="text-[10px] font-medium uppercase tracking-[0.32em]" style={{ color: goldColor }}>
              {subtitle}
            </div>
            <h1 className="font-trail-serif mt-2 text-[34px] font-semibold leading-[1.05]">
              {eventName}
            </h1>
            {pitch && (
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--event-primary-fg,#F6EFE2)]/85">{pitch}</p>
            )}
          </div>
        </div>
      </div>

      {/* CTA card */}
      <div className="mt-5 rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-5 shadow-sm">
        {welcomeCopy && (
          <p className="text-sm leading-relaxed text-[var(--event-text,#3D372C)]">{welcomeCopy}</p>
        )}

        <div className="mt-4 space-y-2.5">
          {primaryCta ?? (
            <button
              type="button"
              className="h-12 w-full rounded-full text-sm font-semibold tracking-wide shadow"
              style={{
                backgroundColor: "var(--event-primary)",
                color: "var(--event-primary-fg)",
              }}
            >
              Join the trail
            </button>
          )}
          {secondaryCta ?? (
            <button
              type="button"
              className="h-11 w-full rounded-full border text-sm font-semibold tracking-wide"
              style={{
                borderColor: "var(--event-border)",
                backgroundColor: "transparent",
                color: "var(--event-text)",
              }}
            >
              I already have a passport
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
          {noAppNote}
        </p>
      </div>

      {/* Stats / venues */}
      {(typeof venueCount === "number" || (venueNames && venueNames.length > 0)) && (
        <div className="mt-4 rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
                On the trail
              </div>
              <div
                className="font-trail-serif mt-1 text-3xl font-semibold"
                style={{ color: "var(--event-primary)" }}
              >
                {venueCount ?? venueNames?.length ?? 0}
                <span className="ml-1 text-sm font-medium text-[var(--event-muted,#8A7E66)]">{venueLabelPlural.toLowerCase()}</span>
              </div>
            </div>
            <div
              className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{
                backgroundColor: "var(--event-accent)",
                color: "var(--event-primary-fg)",
              }}
            >
              Collect stamps
            </div>
          </div>

          {venueNames && venueNames.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {venueNames.slice(0, 6).map((n, i) => (
                <li
                  key={`${n}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-[var(--event-border,#EFE6D2)] bg-[var(--event-page-bg,#F6EFE2)] px-3 py-2 text-sm text-[var(--event-text,#3D372C)]"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{ backgroundColor: `${primaryColor}14`, color: primaryColor }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-medium">{n}</span>
                </li>
              ))}
              {venueNames.length > 6 && (
                <li className="text-center text-[11px] uppercase tracking-[0.18em] text-[var(--event-muted,#8A7E66)]">
                  + {venueNames.length - 6} more {venueLabelPlural.toLowerCase()}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {termsUrl !== undefined && (
        <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-[var(--event-muted,#8A7E66)]">
          By joining you accept the{" "}
          <span className="underline" style={{ color: accentColor }}>
            terms & privacy
          </span>
          .
        </p>
      )}

      {footer}
    </div>
  );
}
