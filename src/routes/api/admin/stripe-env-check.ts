import { createFileRoute } from "@tanstack/react-router";
import { hasServerEnv } from "@/lib/server-env.server";

const SECRET_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_GROWTH",
  "STRIPE_PRICE_REGIONAL",
  "STRIPE_PRICE_PRO_REGION",
  "STRIPE_WEBHOOK_SECRET",
  "GETSTAMPD_SUPABASE_URL",
  "GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY",
  "GETSTAMPD_SUPABASE_PUBLISHABLE_KEY",
] as const;

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getHostname(request: Request): string {
  return request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
}

function detectEnvironment(hostname: string): string {
  const host = hostname.toLowerCase();
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) return "sandbox/preview";
  if (host.includes("id-preview--") || host.includes("-dev.lovable.app")) {
    return "sandbox/preview";
  }
  if (host.endsWith(".lovable.app") || host === "getstampd.com.au" || host === "www.getstampd.com.au") {
    return "published app";
  }
  return "unknown";
}

function buildEnvStatus(request: Request) {
  const hostname = getHostname(request);
  const secrets = Object.fromEntries(
    SECRET_NAMES.map((name) => [name, hasServerEnv(name)]),
  ) as Record<(typeof SECRET_NAMES)[number], boolean>;
  const allSecretsFalse = Object.values(secrets).every((present) => !present);
  return {
    secrets,
    hostname,
    environment: detectEnvironment(hostname),
    allSecretsFalse,
    message: allSecretsFalse
      ? "This deployed environment cannot see Lovable Cloud secrets. Check that the secrets are attached to this environment and republish."
      : null,
  };
}

export const Route = createFileRoute("/api/admin/stripe-env-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const accessToken = getBearerToken(request);
        if (!accessToken) {
          return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
        }

        const { getSupabaseAsUser } = await import("@/integrations/supabase/admin.server");

        let asUser: ReturnType<typeof getSupabaseAsUser>;
        let userId: string;
        try {
          asUser = getSupabaseAsUser(accessToken);
          const { data: userRes, error: userErr } = await asUser.auth.getUser();
          if (userErr || !userRes?.user) {
            return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
          }
          userId = userRes.user.id;
        } catch {
          return Response.json(
            { ok: false, error: "Could not verify sign-in session." },
            { status: 401 },
          );
        }

        const { data: roles, error: rolesErr } = await asUser
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "platform_admin");
        if (rolesErr) {
          console.error("[stripe-env-check] role lookup failed", { error: rolesErr.message });
          return Response.json(
            { ok: false, error: "Could not verify permissions." },
            { status: 403 },
          );
        }
        const isPlatformAdmin = (roles ?? []).some((r) => r.role === "platform_admin");
        if (!isPlatformAdmin) {
          return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
        }

        return Response.json({ ok: true, ...buildEnvStatus(request) });
      },
    },
  },
});
