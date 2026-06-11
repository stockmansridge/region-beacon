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
      className="mb-4 grid grid-cols-2 rounded-full border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-1 shadow-sm"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            to={t.to}
            className={
              "flex items-center justify-center rounded-full px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.2em] transition " +
              (isActive
                ? "bg-[var(--event-primary,#1F3D2B)] text-[var(--event-primary-fg,#F6EFE2)] shadow-sm"
                : "text-[var(--event-muted,#8A7E66)] hover:text-[var(--event-primary,#1F3D2B)]")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
