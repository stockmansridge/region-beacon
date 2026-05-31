import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GetStampdLogo } from "@/components/brand";
import { TestEnvBanner } from "@/components/test-env-banner";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  savePendingOrganisationSignup,
  clearPendingOrganisationSignup,
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

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

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
    slug: z
      .string()
      .trim()
      .min(2, "Organisation URL name must be at least 2 characters.")
      .max(60, "Organisation URL name must be 60 characters or fewer.")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers and hyphens only.",
      ),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the platform terms to continue." }),
    }),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

type Stage = "form" | "submitting" | "check-email" | "done";

function SignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");

  const computedSlug = useMemo(
    () => (slugDirty ? slug : slugifyName(businessName)),
    [slugDirty, slug, businessName],
  );

  // If the user becomes authenticated mid-flow (email confirmation off, or
  // already-signed-in user hits /signup), forward them to /admin.
  useEffect(() => {
    if (stage === "done" && auth.status === "authenticated") {
      navigate({ to: "/admin", replace: true });
    }
  }, [stage, auth.status, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTopError(null);
    setFieldErrors({});

    const parsed = SignupSchema.safeParse({
      fullName,
      email,
      password,
      confirm,
      businessName,
      slug: computedSlug,
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

    // Persist pending organisation details BEFORE auth.signUp so that, if
    // email confirmation is required, we can complete organisation creation
    // after the user confirms email and signs in.
    savePendingOrganisationSignup({
      businessName: data.businessName,
      organisationUrlName: data.slug,
      email: data.email,
      source: "signup",
    });

    // 1. Create auth user
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName },
        emailRedirectTo: window.location.origin + "/admin/login",
      },
    });

    if (signUpErr) {
      clearPendingOrganisationSignup();
      setStage("form");
      setTopError(signUpErr.message || "Could not create account.");
      return;
    }

    // If email confirmation is required, no session yet — ask them to confirm.
    // Pending signup stays in localStorage and will be completed on first sign-in.
    if (!signUpData.session) {
      setStage("check-email");
      return;
    }

    // 2. Create the organisation via SECURITY DEFINER RPC.
    const { error: rpcErr } = await supabase.rpc("create_customer_agency", {
      _agency_name: data.businessName,
      _agency_slug: data.slug,
    });

    if (rpcErr) {
      setStage("form");
      const msg = rpcErr.message || "";
      if (/agency_slug_taken/i.test(msg)) {
        setFieldErrors({
          slug: "That Organisation URL name is already taken. Please choose another.",
        });
      } else if (/invalid_agency_slug/i.test(msg)) {
        setFieldErrors({ slug: "Organisation URL name is invalid." });
      } else if (/invalid_agency_name/i.test(msg)) {
        setFieldErrors({ businessName: "Organisation name is invalid." });
      } else if (/not_authenticated/i.test(msg)) {
        setTopError("Sign-in did not persist. Please try logging in.");
      } else if (/Could not find the function|function .* does not exist/i.test(msg)) {
        setTopError(
          "Self-service signup is not yet enabled on this environment. Please contact support.",
        );
      } else {
        setTopError(`Account created but organisation setup failed: ${msg}`);
      }
      return;
    }

    clearPendingOrganisationSignup();
    setStage("done");
    navigate({ to: "/admin", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TestEnvBanner />
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center">
            <GetStampdLogo variant="blue" size="md" />
          </Link>
          <Link
            to="/admin/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Already have an account? Sign in
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

        {stage === "check-email" ? (
          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              We sent a confirmation link to <strong>{email}</strong>. Click it to
              activate your account, then return and sign in to finish creating
              your workspace.
            </p>
            <Link
              to="/admin/login"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-5 rounded-2xl border bg-card p-8 shadow-sm"
          >
            <div>
              <h1 className="text-xl font-semibold">Create your workspace</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Start setting up your first GetStampd event. Free to test —
                payments and live publishing are not active during public testing.
              </p>
            </div>

            {topError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {topError}
              </div>
            )}

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
              label="Business / organisation name"
              error={fieldErrors.businessName}
            >
              <input
                type="text"
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  if (!slugDirty) setSlug(slugifyName(e.target.value));
                }}
                maxLength={200}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </Field>

            <Field
              label="Workspace URL"
              hint="Used internally to identify your workspace. Lowercase letters, numbers and hyphens."
              error={fieldErrors.slug}
            >
              <div className="flex items-center overflow-hidden rounded-md border bg-background">
                <span className="px-3 text-xs text-muted-foreground">
                  getstampd.com.au/w/
                </span>
                <input
                  type="text"
                  value={computedSlug}
                  onChange={(e) => {
                    setSlugDirty(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                  maxLength={60}
                  className="h-10 flex-1 border-0 bg-transparent px-2 text-sm font-mono focus:outline-none"
                  placeholder="acme-tours"
                />
              </div>
            </Field>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                I agree to the GetStampd platform terms and acknowledge this is a
                public test environment.
              </span>
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
              Create workspace
            </button>
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
