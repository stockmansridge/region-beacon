import { Bookmark } from "lucide-react";
import {
  usePassportBookmarks,
  type BookmarkKind,
} from "@/lib/use-passport-bookmarks";

/**
 * Save-for-later control shown on venue pages and offer cards. Only visible
 * once the visitor has a passport for this event; filled yellow when saved.
 */
export function BookmarkButton({
  eventId,
  kind,
  venueId,
  className,
  size = "md",
}: {
  eventId: string | null | undefined;
  kind: BookmarkKind;
  venueId: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const { enabled, has, toggle } = usePassportBookmarks(eventId);
  if (!enabled || !venueId) return null;

  const saved = has(kind, venueId);
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(kind, venueId);
      }}
      aria-pressed={saved}
      aria-label={saved ? "Remove bookmark" : "Bookmark for later"}
      title={saved ? "Remove bookmark" : "Bookmark for later"}
      className={`inline-grid ${box} flex-shrink-0 place-items-center rounded-full border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)]/90 shadow-sm transition hover:shadow-md ${className ?? ""}`}
    >
      <Bookmark
        className={icon}
        style={{
          color: saved ? "#F5B324" : "var(--event-card-muted, var(--event-muted, #8A7E66))",
          fill: saved ? "#F5B324" : "none",
        }}
      />
    </button>
  );
}
