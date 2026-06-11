import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { classifyHost } from "./components/host-router";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/**
 * Bypass the React/TanStack route tree. Returns only non-sensitive values.
 * Useful for confirming the Worker itself is healthy and what build-time
 * env vars it actually received.
 */
function handleWorkerHealth(request: Request): Response {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  let supabaseUrlHost: string | null = null;
  try {
    if (supabaseUrl) supabaseUrlHost = new URL(supabaseUrl).host;
  } catch {
    supabaseUrlHost = null;
  }
  return new Response(
    JSON.stringify(
      {
        ok: true,
        runtime: "cloudflare-worker",
        host: request.headers.get("host"),
        url: request.url,
        deployTarget: (import.meta.env.VITE_DEPLOY_TARGET as string | undefined) ?? null,
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseKey: Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
        supabaseUrlHost,
        nodeEnv: "production",
      },
      null,
      2,
    ),
    { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

function renderDebugErrorPage(args: {
  message: string;
  route: string;
  host: string;
  classification: string;
}): string {
  const safe = (s: string) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><title>SSR error</title>
<style>body{font:14px/1.5 system-ui;margin:2rem;color:#111}code{background:#f3f4f6;padding:2px 6px;border-radius:4px}pre{background:#f3f4f6;padding:1rem;border-radius:6px;white-space:pre-wrap}</style>
</head><body><h1>SSR error (diagnostic)</h1>
<p><strong>host:</strong> <code>${safe(args.host)}</code></p>
<p><strong>route:</strong> <code>${safe(args.route)}</code></p>
<p><strong>classification:</strong> <code>${safe(args.classification)}</code></p>
<p><strong>message:</strong></p><pre>${safe(args.message)}</pre>
<p><a href="/debug/worker-health">/debug/worker-health</a></p>
</body></html>`;
}

async function normalizeCatastrophicSsrResponse(
  response: Response,
  ctx: { host: string; pathname: string; classification: string },
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const captured = consumeLastCapturedError();
  const err = captured instanceof Error ? captured : new Error(`h3 swallowed SSR error: ${body}`);
  console.error("[ssr] caught error", {
    host: ctx.host,
    pathname: ctx.pathname,
    classification: ctx.classification,
    message: err.message,
    stack: (err.stack ?? "").split("\n").slice(0, 6).join("\n"),
  });
  return new Response(
    renderDebugErrorPage({
      message: err.message + "\n\n" + (err.stack ?? "").split("\n").slice(0, 6).join("\n"),
      route: ctx.pathname,
      host: ctx.host,
      classification: ctx.classification,
    }),
    { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    let classification = "unknown";
    try {
      classification = classifyHost(url.hostname).kind;
    } catch {
      /* ignore */
    }

    if (url.pathname === "/debug/worker-health") {
      return handleWorkerHealth(request);
    }

    try {

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response, {
        host,
        pathname: url.pathname,
        classification,
      });
      // Prevent browsers / Cloudflare from caching the SSR HTML shell.
      // Hashed assets under /assets/* are served by Nitro's ASSETS binding
      // with `immutable` long-cache headers (correct), but the HTML shell
      // that references those hashed chunks must always be revalidated —
      // otherwise an old shell sticks around and tries to dynamically
      // import chunk hashes that no longer exist after a redeploy,
      // producing "Failed to fetch dynamically imported module" errors.
      const contentType = normalized.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        const headers = new Headers(normalized.headers);
        headers.set("cache-control", "no-cache, no-store, must-revalidate");
        headers.set("pragma", "no-cache");
        return new Response(normalized.body, {
          status: normalized.status,
          statusText: normalized.statusText,
          headers,
        });
      }
      return normalized;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[ssr] thrown", {
        host,
        pathname: url.pathname,
        classification,
        message: err.message,
        stack: (err.stack ?? "").split("\n").slice(0, 6).join("\n"),
      });
      return new Response(
        renderDebugErrorPage({
          message: err.message + "\n\n" + (err.stack ?? "").split("\n").slice(0, 6).join("\n"),
          route: url.pathname,
          host,
          classification,
        }),
        { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
  },
};
