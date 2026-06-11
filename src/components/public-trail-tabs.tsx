import { Link } from "@tanstack/react-router";

type TabKey = "venues" | "offers";

export function PublicTrailTabs({
  active,
  venueLabelPlural = "Venues",
}: {
  active: TabKey;
  venueLabelPlural?: string;
}) {
  const tabs: { key: TabKey; label: string; to: "/venues" | "/offers" }[] = [
    { key: "venues", label: venueLabelPlural, to: "/venues" },
    { key: "offers", label: "Offers", to: "/offers" },
  ];
  return (
    <nav
      aria-label="Trail sections"
      className="mb-5 grid grid-cols-2 border-b border-[var(--event-border,#E6DCC7)]"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            to={t.to}
            className={
              "relative flex items-center justify-center pb-3 pt-2 text-[12px] font-semibold uppercase tracking-[0.22em] transition " +
              (isActive
                ? "text-[var(--event-primary,#1F3D2B)]"
                : "text-[var(--event-muted,#8A7E66)] hover:text-[var(--event-primary,#1F3D2B)]")
            }
          >
            {t.label}
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-x-6 -bottom-px h-[2px] rounded-full bg-[var(--event-primary,#1F3D2B)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
