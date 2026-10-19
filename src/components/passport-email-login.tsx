import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { loginWithPassportEmail } from "@/lib/passport-login";
import { canPersistLocally } from "@/lib/storage-check";
import { consumeReturnTo } from "@/lib/return-to";

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

/** "Already registered? Log in" — opens the passport from the email address. No email is sent. */
export function PassportEmailLogin({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "opening" | "invalid" | "notfound" | "unavailable">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setState("invalid");
      return;
    }
    setState("opening");
    try {
      const res = await loginWithPassportEmail(eventId, value);
      if (res.ok) {
        // If the visitor arrived from a QR scan, resume that scan once
        // instead of landing on the passport page.
        const returnTo = consumeReturnTo(eventId);
        if (returnTo) {
          window.location.replace(returnTo);
          return;
        }
        navigate({ to: "/passport/$token", params: { token: res.token } });
        return;
      }
      setState(res.reason);
    } catch {
      setState("unavailable");
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
      {state === "notfound" ? (
        <>
          <p className="mt-2 text-sm">
            We couldn't find a passport for that email on this event. Check the spelling and try again, or sign up below.
          </p>
          <button
            type="button"
            onClick={() => { setOpen(false); setState("idle"); }}
            className="mt-3 w-full text-xs underline"
          >
            Back to sign up
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs opacity-80">Enter the email you signed up with and we'll open your passport.</p>
          {state === "unavailable" && (
            <p role="alert" className="mt-2 text-sm">
              We couldn't check your passport right now. Please try again shortly. You don't need to sign up again.
            </p>
          )}
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-3 h-11 w-full rounded-xl border bg-transparent px-3 text-sm"
            style={{ borderColor: "var(--event-card-border)" }}
          />
          {state === "invalid" && <p className="mt-2 text-xs">Please enter a valid email address.</p>}
          <button
            type="submit"
            disabled={state === "opening"}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold disabled:opacity-60"
            style={{ backgroundColor: "var(--event-primary)", color: "var(--event-primary-foreground, #fff)" }}
          >
            {state === "opening" ? "Opening…" : "Open my passport"}
          </button>
          <button type="button" onClick={() => { setOpen(false); setState("idle"); }} className="mt-2 w-full text-xs underline">
            Back to sign up
          </button>
        </>
      )}
    </form>
  );
}
