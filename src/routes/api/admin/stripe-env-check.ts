import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export const Route = createFileRoute("/api/admin/stripe-env-check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const accessToken = getBearerToken(request);
        if (!accessToken) {
          return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
        }

        const { getSupabaseAsUser } = await import(
          "@/integrations/supabase/admin.server"
        );

        let asUser: ReturnType<typeof getSupabaseAsUser>;
        try {
          asUser = getSupabaseAsUser(accessToken);
          const { data: userRes, error: userErr } = await asUser.auth.getUser();
          if (userErr || !userRes?.user) {
            return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });
          }
        } catch {
          return Response.json(
            { ok: false, error: "Could not verify sign-in session." },
            { status: 401 },
          );
        }

        const { data: roles, error: rolesErr } = await asUser
          .from("user_roles")
          .select("role")
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

        const env = process.env;
        return Response.json({
          STRIPE_SECRET_KEY: Boolean(env.STRIPE_SECRET_KEY),
          STRIPE_PRICE_STARTER: Boolean(env.STRIPE_PRICE_STARTER),
          STRIPE_PRICE_GROWTH: Boolean(env.STRIPE_PRICE_GROWTH),
          STRIPE_PRICE_REGIONAL: Boolean(env.STRIPE_PRICE_REGIONAL),
          STRIPE_PRICE_PRO_REGION: Boolean(env.STRIPE_PRICE_PRO_REGION),
          STRIPE_WEBHOOK_SECRET: Boolean(env.STRIPE_WEBHOOK_SECRET),
          GETSTAMPD_SUPABASE_URL: Boolean(env.GETSTAMPD_SUPABASE_URL),
          GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY: Boolean(
            env.GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY,
          ),
          GETSTAMPD_SUPABASE_PUBLISHABLE_KEY: Boolean(
            env.GETSTAMPD_SUPABASE_PUBLISHABLE_KEY,
          ),
        });
      },
    },
  },
});