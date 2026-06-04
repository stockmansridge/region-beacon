import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return Response.json(
    {
      ok: true,
      STRIPE_SECRET_KEY: Boolean(Deno.env.get("STRIPE_SECRET_KEY")),
      STRIPE_PRICE_STARTER: Boolean(Deno.env.get("STRIPE_PRICE_STARTER")),
      STRIPE_PRICE_GROWTH: Boolean(Deno.env.get("STRIPE_PRICE_GROWTH")),
      STRIPE_PRICE_REGIONAL: Boolean(Deno.env.get("STRIPE_PRICE_REGIONAL")),
      STRIPE_PRICE_PRO_REGION: Boolean(Deno.env.get("STRIPE_PRICE_PRO_REGION")),
      STRIPE_WEBHOOK_SECRET: Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET")),
      SUPABASE_URL: Boolean(Deno.env.get("SUPABASE_URL")),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
    },
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
