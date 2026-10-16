import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { requestPassportLoginLink } from "@/lib/passport-login.functions";
import { canPersistLocally } from "@/lib/storage-check";

/** Warns visitors whose browser won't keep their passport on this device. */
export function StorageBlockedNotice() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => setBlocked(!canPersistLocally()), []);
  if (!blocked) return null;
  return (
    <div
      role="status"
      className="mb-4 rounded-xl border px-3 py-2 text-sm"
      style={{ borderColor: "var(--event-card-border)", backgroundColor: "var(--event-card-bg)", color: "var(--event-card-text)" }}
    >
      Your browser isn't saving your passport (private browsing or blocked cookies). Allow cookies for this site
      or turn off private browsing — or use "Log in" with your email to get back in any time.
    </div>
  );
}

/** "Already registered? Log in" — emails a single-use login link. */
export function PassportEmailLogin({ eventId }: { eventId: string }) {
  const request = useServerFn(requestPassportLoginLink);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      await request({ data: { eventId, email: email.trim() } });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  const cardStyle = { borderColor: "var(--event-card-border)", backgroundColor: "var(--event-card-bg)", color: "var(--event-card-text)" };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 inline-flex h-11 w-full items-center justify-center rounded-full border text-sm font-semibold"
        style={cardStyle}
      >
        Already registered? Log in
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-3xl border p-5" style={cardStyle} noValidate>
      <p className="text-sm font-semibold">Log in to your passport</p>
      {state === "sent" ? (
        <p className="mt-2 text-sm">
          If that email is registered for this event, we've sent you a login link. It works once and expires in 30 minutes.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs opacity-80">Enter the email you signed up with and we'll email you a login link.</p>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-3 h-11 w-full rounded-xl border bg-transparent px-3 text-sm"
            style={{ borderColor: "var(--event-card-border)" }}
          />
          {state === "error" && <p className="mt-2 text-xs">Please enter a valid email and try again.</p>}
          <button
            type="submit"
            disabled={state === "sending"}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold disabled:opacity-60"
            style={{ backgroundColor: "var(--event-primary)", color: "var(--event-primary-foreground, #fff)" }}
          >
            {state === "sending" ? "Sending…" : "Email me my login link"}
          </button>
        </>
      )}
      <button type="button" onClick={() => { setOpen(false); setState("idle"); }} className="mt-2 w-full text-xs underline">
        Back to sign up
      </button>
    </form>
  );
}
