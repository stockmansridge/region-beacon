import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_EVENT } from "@/lib/demo-cargo-road";

export const Route = createFileRoute("/demo/invite")({
  head: () => ({ meta: [{ title: `Invite friends — ${DEMO_EVENT.name} demo` }] }),
  component: DemoInvite,
});

function DemoInvite() {
  const url = "https://getstampd.com.au/demo";
  const message = `Come explore ${DEMO_EVENT.name} with me on GetStampd — ${url}`;

  return (
    <DemoShell activeNav="more">
      <main className="pb-20">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          Invite friends
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--event-muted)" }}>
          Share the trail and see who collects the most stamps.
        </p>

        <div
          className="mt-5 rounded-2xl border p-4"
          style={{ borderColor: "var(--event-card-border)", backgroundColor: "var(--event-card-bg)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--event-muted)" }}>
            Trail link
          </div>
          <div className="mt-1 break-all text-sm font-semibold" style={{ color: "var(--event-card-heading)" }}>
            {url}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(url).catch(() => undefined)}
            className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: "var(--event-primary)", color: "var(--event-primary)" }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy link
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <ShareTile
            icon={<Share2 className="h-5 w-5" />}
            label="Share"
            onClick={() => {
              if (typeof navigator !== "undefined" && "share" in navigator) {
                navigator.share({ title: DEMO_EVENT.name, text: message, url }).catch(() => undefined);
              }
            }}
          />
          <ShareTile
            icon={<MessageCircle className="h-5 w-5" />}
            label="SMS"
            href={`sms:?body=${encodeURIComponent(message)}`}
          />
          <ShareTile
            icon={<Mail className="h-5 w-5" />}
            label="Email"
            href={`mailto:?subject=${encodeURIComponent(DEMO_EVENT.name)}&body=${encodeURIComponent(message)}`}
          />
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/demo"
            className="text-xs font-semibold uppercase tracking-[0.22em] underline"
            style={{ color: "var(--event-primary)" }}
          >
            Back to home
          </Link>
        </div>
      </main>
    </DemoShell>
  );
}

function ShareTile({
  icon,
  label,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: "color-mix(in srgb, var(--event-primary) 12%, transparent)",
          color: "var(--event-primary)",
        }}
      >
        {icon}
      </span>
      <span className="text-xs font-semibold" style={{ color: "var(--event-card-heading)" }}>
        {label}
      </span>
    </>
  );
  const cls =
    "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition hover:shadow-sm";
  const style = {
    borderColor: "var(--event-card-border)",
    backgroundColor: "var(--event-card-bg)",
  } as const;
  if (href) {
    return (
      <a href={href} className={cls} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {inner}
    </button>
  );
}
