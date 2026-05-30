import { Stamp } from "lucide-react";

/**
 * Shared GetStampd brand marks.
 *
 * - `GetStampdMark`: square icon only (logo mark).
 * - `GetStampdLogo`: icon + wordmark, used in nav/sidebar/login headers.
 * - `PoweredByGetStampd`: small footer tag used on public/demo trail pages.
 *
 * Variants:
 * - `blue` (default): SaaS blue gradient for platform/admin/marketing.
 * - `mono`:           neutral mark for dark surfaces.
 * - `trail`:          muted cream/dark-green tone for customer trail pages.
 */

type Variant = "blue" | "mono" | "trail";

type MarkProps = {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_MAP = {
  sm: { box: "h-7 w-7 rounded-lg", icon: "h-3.5 w-3.5" },
  md: { box: "h-9 w-9 rounded-xl", icon: "h-5 w-5" },
  lg: { box: "h-12 w-12 rounded-2xl", icon: "h-6 w-6" },
} as const;

function variantClasses(variant: Variant) {
  switch (variant) {
    case "mono":
      return "bg-slate-900 text-white";
    case "trail":
      return "bg-[#1F3D2B] text-[#FBF5E8]";
    case "blue":
    default:
      return "bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#06b6d4] text-white shadow-sm";
  }
}

export function GetStampdMark({ variant = "blue", size = "md", className = "" }: MarkProps) {
  const s = SIZE_MAP[size];
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center ${s.box} ${variantClasses(variant)} ${className}`}
    >
      <Stamp className={s.icon} strokeWidth={2.25} />
    </span>
  );
}

type LogoProps = MarkProps & {
  /** Optional small caption under the wordmark, e.g. "Event admin". */
  caption?: string;
  /** Color for the wordmark text. Defaults to a sensible value per variant. */
  wordmarkClassName?: string;
};

export function GetStampdLogo({
  variant = "blue",
  size = "md",
  caption,
  className = "",
  wordmarkClassName,
}: LogoProps) {
  const wordmarkColor =
    wordmarkClassName ??
    (variant === "trail"
      ? "text-[#1F3D2B]"
      : variant === "mono"
        ? "text-slate-900 dark:text-white"
        : "text-slate-900 dark:text-white");

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <GetStampdMark variant={variant} size={size} />
      <span className="leading-tight">
        <span className={`block text-[15px] font-semibold tracking-tight ${wordmarkColor}`}>
          GetStampd
        </span>
        {caption ? (
          <span className="block text-xs text-muted-foreground">{caption}</span>
        ) : null}
      </span>
    </span>
  );
}

export function PoweredByGetStampd({
  variant = "trail",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const tone =
    variant === "trail"
      ? "text-[#8A7E66]"
      : variant === "mono"
        ? "text-slate-500"
        : "text-slate-500";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] ${tone} ${className}`}
    >
      <GetStampdMark variant={variant} size="sm" />
      <span>Powered by GetStampd</span>
    </span>
  );
}
