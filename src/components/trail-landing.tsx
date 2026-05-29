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
  heroImageUrl?: string | null;
  venueCount?: number;
  venueNames?: string[];
  venueLabelPlural?: string;
  termsUrl?: string | null;
  primaryCta?: ReactNode;
  secondaryCta?: ReactNode;
  badge?: string;
  noAppNote?: string;
  footer?: ReactNode;
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
  heroImageUrl,
  venueCount,
  venueNames,
  venueLabelPlural = DEFAULT_VENUE_LABEL_PLURAL,
  termsUrl,
  primaryCta,
  secondaryCta,
  badge,
  noAppNote = "No app download required",
  footer,
}: TrailLandingProps) {
  const initials = (monogram ?? eventName)
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const hero = heroImageUrl ?? DEFAULT_HERO;

  return (
    <div className="mx-auto w-full max-w-md" style={fontFamily ? { fontFamily } : undefined}>
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
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${primaryColor}33 0%, ${primaryColor}AA 60%, ${primaryColor}F0 100%)`,
            }}
          />
          {badge && (
            <div
              className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#F6EFE2]"
              style={{ backgroundColor: `${accentColor}E6` }}
            >
              <span className="h-1 w-1 rounded-full bg-[#F6EFE2]" />
              {badge}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-7 text-center text-[#F6EFE2]">
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
            <div className="text-[10px] font-medium uppercase tracking-[0.32em]" style={{ color: goldColor }}>
              {subtitle}
            </div>
            <h1 className="font-trail-serif mt-2 text-[34px] font-semibold leading-[1.05]">
              {eventName}
            </h1>
            {pitch && (
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#F6EFE2]/85">{pitch}</p>
            )}
          </div>
        </div>
      </div>

      {/* CTA card */}
      <div className="mt-5 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 shadow-sm">
        {welcomeCopy && (
          <p className="text-sm leading-relaxed text-[#3D372C]">{welcomeCopy}</p>
        )}

        <div className="mt-4 space-y-2.5">
          {primaryCta ?? (
            <button
              type="button"
              className="h-12 w-full rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
              style={{ backgroundColor: primaryColor }}
            >
              Join the trail
            </button>
          )}
          {secondaryCta ?? (
            <button
              type="button"
              className="h-11 w-full rounded-full border bg-transparent text-sm font-semibold tracking-wide"
              style={{ borderColor: `${primaryColor}40`, color: primaryColor }}
            >
              I already have a passport
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
          {noAppNote}
        </p>
      </div>

      {/* Stats / venues */}
      {(typeof venueCount === "number" || (venueNames && venueNames.length > 0)) && (
        <div className="mt-4 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
                On the trail
              </div>
              <div
                className="font-trail-serif mt-1 text-3xl font-semibold"
                style={{ color: primaryColor }}
              >
                {venueCount ?? venueNames?.length ?? 0}
                <span className="ml-1 text-sm font-medium text-[#8A7E66]">stops</span>
              </div>
            </div>
            <div
              className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ backgroundColor: `${goldColor}33`, color: accentColor }}
            >
              Collect stamps
            </div>
          </div>

          {venueNames && venueNames.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {venueNames.slice(0, 6).map((n, i) => (
                <li
                  key={`${n}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-[#EFE6D2] bg-[#F6EFE2] px-3 py-2 text-sm text-[#3D372C]"
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
                <li className="text-center text-[11px] uppercase tracking-[0.18em] text-[#8A7E66]">
                  + {venueNames.length - 6} more stops
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {termsUrl !== undefined && (
        <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-[#8A7E66]">
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
