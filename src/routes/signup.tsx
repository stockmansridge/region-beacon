import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GetStampdLogo } from "@/components/brand";

import { ArrowLeft, Loader2 } from "lucide-react";
import { authUrl } from "@/lib/auth-redirect";
import { signOut } from "@/hooks/use-auth";
import {
  savePendingOrganisationSignup,
  savePendingOrganisationSignupServer,
  clearPendingOrganisationSignup,
  isOrganisationSignupServerSetupError,
  ORG_SIGNUP_SERVER_SETUP_ERROR,
  slugifyOrganisationName,
  createAgencyWithSlugRetry,
  completePendingOrganisationSignup,
} from "@/lib/pending-organisation-signup";


export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your GetStampd account" },
      {
        name: "description",
        content:
          "Create a GetStampd workspace and start setting up your first event.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SignupPage,
});

const SignupSchema = z
  .object({
    fullName: z.string().trim().min(1, "Your name is required.").max(120),
    email: z.string().trim().email("Enter a valid email address.").max(255),
    password: z.string().min(8, "Password must be at least 8 characters.").max(200),
    confirm: z.string(),
    businessName: z
      .string()
      .trim()
      .min(1, "Organisation name is required.")
      .max(200),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the Terms and Privacy Policy to continue." }),
    }),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

type Stage = "form" | "submitting" | "check-email" | "account-exists" | "done";

function LegalAgreement() {
  // stopPropagation prevents the surrounding <label> from toggling the
  // checkbox when the user clicks/activates one of these links.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span>
      I agree to the GetStampd{" "}
      <Link
        to="/terms"
        target="_blank"
        rel="noreferrer"
        className="underline font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring rounded-sm"
        onClick={stop}
        onKeyDown={stop}
      >
        Terms and Conditions
      </Link>{" "}
      and{" "}
      <Link
        to="/privacy"
        target="_blank"
        rel="noreferrer"
        className="underline font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring rounded-sm"
        onClick={stop}
        onKeyDown={stop}
      >
        Privacy Policy
      </Link>
      .
    </span>
  );
}

function SignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [experienceType, setExperienceType] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [pendingSaveDebug, setPendingSaveDebug] = useState<{
    saved: boolean;
    pendingId: string | null;
    status: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[signup] pending signup server flow enabled");
  }, []);

  useEffect(() => {
    if (stage === "done" && auth.status === "authenticated") {
      navigate({ to: "/admin", replace: true });
    }
  }, [stage, auth.status, navigate]);

  async function handleSignOutAndRestart() {
    clearPendingOrganisationSignup();
    await signOut();
  }


  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTopError(null);
    setFieldErrors({});
    setPendingSaveDebug(null);

    const parsed = SignupSchema.safeParse({
      fullName,
      email,
      password,
      confirm,
      businessName,
      acceptTerms,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "_";
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setStage("submitting");
    const data = parsed.data;
    const baseSlug = slugifyOrganisationName(data.businessName);

    // Persist pending organisation details BEFORE auth.signUp so we can
    // complete organisation creation after the user confirms email.
    savePendingOrganisationSignup({
      businessName: data.businessName,
      organisationUrlName: baseSlug,
      intention: experienceType || undefined,
      email: data.email,
      source: "signup",
    });

    const serverSave = await savePendingOrganisationSignupServer({
      email: data.email,
      fullName: data.fullName,
      businessName: data.businessName,
      organisationUrlName: baseSlug,
      intention: experienceType || null,
    });
    if (!serverSave.ok) {
      // eslint-disable-next-line no-console
      console.warn("[signup] save_pending_organisation_signup failed", {
        code: serverSave.error.code,
        message: serverSave.error.message,
      });
      // eslint-disable-next-line no-console
      console.log("[signup] pending signup saved", {
        email: data.email,
        organisationName: data.businessName,
        signupIntention: experienceType || null,
        pendingId: null,
        status: null,
        error: serverSave.error.message || serverSave.error.code || "unknown_error",
      });
      setPendingSaveDebug({
        saved: false,
        pendingId: null,
        status: null,
        error: serverSave.error.message || serverSave.error.code || "Unknown error",
      });
      setStage("form");
      const msg = serverSave.error.message || "";
      setTopError(
        isOrganisationSignupServerSetupError(msg)
          ? ORG_SIGNUP_SERVER_SETUP_ERROR
          : `We could not securely save your organisation details: ${msg || "Unknown error"}`,
      );
      return;
    }
    // eslint-disable-next-line no-console
    console.log("[signup] pending signup saved", {
      email: data.email,
      organisationName: data.businessName,
      signupIntention: experienceType || null,
      pendingId: serverSave.id,
      status: "pending",
      error: null,
    });
    setPendingSaveDebug({
      saved: true,
      pendingId: serverSave.id,
      status: "pending",
      error: null,
    });

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName, experience_type: experienceType || null },
        emailRedirectTo: authUrl("/admin/login?complete_signup=1"),
      },
    });

    // eslint-disable-next-line no-console
    console.log("[signup] signUp response", {
      hasUser: !!signUpData?.user,
      hasSession: !!signUpData?.session,
      userId: signUpData?.user?.id,
      emailConfirmedAt: signUpData?.user?.email_confirmed_at ?? null,
      identitiesCount: signUpData?.user?.identities?.length ?? 0,
      errorCode: (signUpErr as { code?: string } | null)?.code,
      errorStatus: (signUpErr as { status?: number } | null)?.status,
      errorMessage: signUpErr?.message,
    });

    if (signUpErr) {
      if (/already.*(registered|exists)|user_already_exists/i.test(signUpErr.message || "")) {
        setStage("account-exists");
        return;
      }
      setStage("form");
      setTopError(signUpErr.message || "Could not create account.");
      return;
    }

    if (
      signUpData?.user &&
      !signUpData.session &&
      Array.isArray(signUpData.user.identities) &&
      signUpData.user.identities.length === 0
    ) {
      // Account already exists in auth.users. The pending organisation row has
      // already been saved server-side, so signing in or resetting password can
      // still finish organisation creation without relying on localStorage.
      setStage("account-exists");
      return;
    }

    if (!signUpData.session) {
      setStage("check-email");
      return;
    }

    const completion = await completePendingOrganisationSignup();
    if (!completion.ok) {
      // eslint-disable-next-line no-console
      console.warn("[org-signup] immediate signup completion error", {
        supabaseUrl: SUPABASE_URL,
        code: completion.code,
        message: completion.message,
      });
      setStage("form");
      if (completion.code === "invalid_name") {
        setFieldErrors({ businessName: "Organisation name is invalid." });
      } else {
        setTopError(completion.message);
      }
      return;
    }

    clearPendingOrganisationSignup();
    setStage("done");
    navigate({ to: "/admin", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">

      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center">
            <GetStampdLogo variant="blue" size="md" />
          </Link>
          <Link
            to="/admin/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <span className="hidden sm:inline">Already have an account? </span>Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        {auth.status === "authenticated" && stage !== "check-email" && stage !== "account-exists" && stage !== "done" ? (
          <AuthenticatedRecoveryForm
            email={auth.email ?? ""}
            onSignOut={handleSignOutAndRestart}
            onCreated={() => navigate({ to: "/admin", replace: true })}
          />

        ) : stage === "check-email" ? (
          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              We sent a confirmation link to <strong>{email}</strong>. Click it to
              activate your account, then return and sign in to finish creating
              your organisation.
            </p>
            <PendingSignupDebugLine debug={pendingSaveDebug} />
            <a
              href={authUrl("/admin/login?complete_signup=1")}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Go to sign in
            </a>
          </div>
        ) : stage === "account-exists" ? (
          <AccountExistsCard
            email={email}
            businessName={businessName}
            pendingSaveDebug={pendingSaveDebug}
            onBack={() => setStage("form")}
          />
        ) : (

          <form
            onSubmit={onSubmit}
            className="space-y-5 rounded-2xl border bg-card p-8 shadow-sm"
          >
            <div>
              <h1 className="text-xl font-semibold">Start your free GetStampd account</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your free account and start building your first digital stamp trail, market event or tourism experience.
              </p>
            </div>


            {topError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {topError}
              </div>
            )}
            <PendingSignupDebugLine debug={pendingSaveDebug} />

            <Field label="Your full name" error={fieldErrors.fullName}>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
                autoComplete="name"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </Field>

            <Field label="Email" error={fieldErrors.email}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                autoComplete="email"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Password" error={fieldErrors.password}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={200}
                  autoComplete="new-password"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                />
              </Field>
              <Field label="Confirm password" error={fieldErrors.confirm}>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  maxLength={200}
                  autoComplete="new-password"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                />
              </Field>
            </div>

            <Field
              label="Organisation name"
              hint="You can change your organisation's URL later in the admin portal."
              error={fieldErrors.businessName}
            >
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                maxLength={200}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </Field>

            <Field label="Type of experience" hint="Optional — helps us tailor your setup.">
              <select
                value={experienceType}
                onChange={(e) => setExperienceType(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select an option…</option>
                <option value="wine_trail">Wine trail</option>
                <option value="market_event">Market event</option>
                <option value="tourism_group">Tourism group</option>
                <option value="food_trail">Food trail</option>
                <option value="festival_event">Festival or event</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4"
                required
              />
              <LegalAgreement />
            </label>
            {fieldErrors.acceptTerms && (
              <p className="text-xs text-destructive">{fieldErrors.acceptTerms}</p>
            )}

            <button
              type="submit"
              disabled={stage === "submitting"}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {stage === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
              Create free account
            </button>
            <p className="text-center text-xs text-muted-foreground">
              No payment required. Upgrade when you&rsquo;re ready.
            </p>

          </form>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PendingSignupDebugLine({
  debug,
}: {
  debug: {
    saved: boolean;
    pendingId: string | null;
    status: string | null;
    error: string | null;
  } | null;
}) {
  if (!debug) return null;
  return (
    <div className="mt-3 rounded-md border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      Pending signup server save: {debug.saved ? "saved" : "failed"}
      {debug.pendingId ? ` · id ${debug.pendingId}` : ""}
      {debug.status ? ` · status ${debug.status}` : ""}
      {debug.error ? ` · error ${debug.error}` : ""}
    </div>
  );
}

function AuthenticatedRecoveryForm({
  email,
  onSignOut,
  onCreated,
}: {
  email: string;
  onSignOut: () => void | Promise<void>;
  onCreated: () => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const errs: Record<string, string> = {};
    if (!businessName.trim()) errs.businessName = "Organisation name is required.";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setBusy(true);
    const baseSlug = slugifyOrganisationName(businessName);
    const { error: rpcErr } = await createAgencyWithSlugRetry(businessName.trim(), baseSlug);

    setBusy(false);
    if (rpcErr) {
      const msg = rpcErr.message || "";
      // eslint-disable-next-line no-console
      console.warn("[org-signup] recovery RPC error", {
        supabaseUrl: SUPABASE_URL,
        code: rpcErr.code,
        message: msg,
      });
      if (/invalid_agency_name/i.test(msg)) {
        setFieldErrors({ businessName: "Organisation name is invalid." });
      } else if (isOrganisationSignupServerSetupError(msg)) {
        setError(ORG_SIGNUP_SERVER_SETUP_ERROR);
      } else {
        setError(msg || "Could not create organisation.");
      }
      return;
    }
    clearPendingOrganisationSignup();
    onCreated();
  }

  return (
    <div className="rounded-2xl border bg-card p-8 shadow-sm">
      <h1 className="text-xl font-semibold">Create your organisation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You're signed in as <strong>{email || "this account"}</strong>. Enter your
        organisation name to finish setup, or sign out to use a different email.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Field
          label="Organisation name"
          hint="You can change your organisation's URL later in the admin portal."
          error={fieldErrors.businessName}
        >
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={200}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
        </Field>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Create organisation
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-xs">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground">
          Continue to admin
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="text-muted-foreground hover:text-foreground"
        >
          Sign out and use a different email
        </button>
      </div>
    </div>
  );
}

function AccountExistsCard({
  email,
  businessName,
  pendingSaveDebug,
  onBack,
}: {
  email: string;
  businessName: string;
  pendingSaveDebug: {
    saved: boolean;
    pendingId: string | null;
    status: string | null;
    error: string | null;
  } | null;
  onBack: () => void;
}) {
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resetError, setResetError] = useState<string | null>(null);

  async function sendReset() {
    setResetState("sending");
    setResetError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authUrl("/admin/update-password?complete_signup=1"),
    });
    if (error) {
      setResetState("error");
      setResetError(error.message || "Could not send reset email.");
      return;
    }
    setResetState("sent");
  }

  return (
    <div className="rounded-2xl border bg-card p-8 shadow-sm">
      <h1 className="text-xl font-semibold">An account already exists</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        An account already exists for <strong>{email}</strong>. Sign in to finish
        creating <strong>{businessName}</strong>, or reset your password if you
        do not remember it. We&rsquo;ve kept your organisation details — they&rsquo;ll
        be applied automatically as soon as you sign in.
      </p>
      <PendingSignupDebugLine debug={pendingSaveDebug} />

      <div className="mt-6 flex flex-col gap-3">
        <a
          href={authUrl(`/admin/login?complete_signup=1&email=${encodeURIComponent(email)}`)}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Sign in to finish creating your organisation
        </a>
        {resetState === "sent" ? (
          <p className="rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
            Password reset email sent to <strong>{email}</strong>. Follow the link, set
            a new password, then sign in to finish creating your organisation.
          </p>
        ) : (
          <button
            type="button"
            onClick={sendReset}
            disabled={resetState === "sending"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {resetState === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
            Email me a password reset link
          </button>
        )}
        {resetState === "error" && resetError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {resetError}
          </p>
        )}
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Use a different email
        </button>
      </div>
    </div>
  );
}
