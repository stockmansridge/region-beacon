import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_EVENT, useDemoPassport } from "@/lib/demo-cargo-road";

export const Route = createFileRoute("/demo/join")({
  head: () => ({ meta: [{ title: `Join — ${DEMO_EVENT.name} demo` }] }),
  component: DemoJoin,
});

function DemoJoin() {
  const passport = useDemoPassport();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(passport.firstName ?? "");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);

  return (
    <DemoShell activeNav="passport">
      <main className="pb-20">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          Start your passport
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--event-muted)" }}>
          Register once to collect stamps across all six wineries. This is a demo — no data is saved
          to the real event.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!firstName.trim() || !agree) return;
            passport.register(firstName);
            navigate({ to: "/demo/passport" });
          }}
        >
          <Field label="First name" required>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: "var(--event-card-border)",
                backgroundColor: "var(--event-card-bg)",
                color: "var(--event-card-heading)",
              }}
            />
          </Field>
          <Field label="Last name">
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: "var(--event-card-border)",
                backgroundColor: "var(--event-card-bg)",
                color: "var(--event-card-heading)",
              }}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: "var(--event-card-border)",
                backgroundColor: "var(--event-card-bg)",
                color: "var(--event-card-heading)",
              }}
            />
          </Field>

          <label
            className="flex items-start gap-2 text-xs"
            style={{ color: "var(--event-muted)" }}
          >
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5"
            />
            <span>I agree to the demo terms &amp; privacy notice.</span>
          </label>

          <button
            type="submit"
            disabled={!firstName.trim() || !agree}
            className="grid h-12 w-full place-items-center rounded-full text-sm font-semibold shadow disabled:opacity-60"
            style={{
              backgroundColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-fg)",
            }}
          >
            Create demo passport
          </button>

          <div className="text-center text-xs" style={{ color: "var(--event-muted)" }}>
            Already registered on this device?{" "}
            <Link to="/demo/passport" className="underline">View passport</Link>
          </div>
        </form>
      </main>
    </DemoShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em]"
        style={{ color: "var(--event-muted)" }}
      >
        {label} {required ? <span style={{ color: "var(--event-accent)" }}>*</span> : null}
      </span>
      {children}
    </label>
  );
}
