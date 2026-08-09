// Server-only runtime environment access.
// Lovable published/server runtimes may expose secrets through either a
// Deno-style env accessor or a Node-compatible process.env shim. Always read
// per request via these helpers; never cache secret values at module scope.

type DenoLike = {
  env?: {
    get?: (name: string) => string | undefined;
  };
};

type ProcessLike = {
  env?: Record<string, string | undefined>;
};

let workerEnv: Record<string, unknown> | undefined;

/**
 * Makes Cloudflare Worker bindings available to server helpers. The custom
 * Worker entry receives these as the second fetch argument; they are not
 * guaranteed to be mirrored onto process.env by the runtime.
 */
export function setServerEnvBindings(env: unknown): void {
  if (typeof env !== "object" || env === null) return;
  workerEnv = env as Record<string, unknown>;
}

export function readServerEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    Deno?: DenoLike;
    process?: ProcessLike;
  };

  const workerValue = workerEnv?.[name];
  if (typeof workerValue === "string" && workerValue) return workerValue;

  try {
    const denoGet = runtime.Deno?.env?.get;
    if (typeof denoGet === "function") {
      const value = denoGet(name);
      if (value) return value;
    }
  } catch {
    // Ignore unavailable env accessors and try the next runtime shape.
  }

  // Bare `process` identifier: in the Worker/SSR bundle `globalThis.process`
  // may be absent even though the injected `process.env` binding works.
  try {
    if (typeof process !== "undefined" && process.env) {
      const value = process.env[name];
      if (value) return value;
    }
  } catch {
    // Ignore and fall through.
  }

  return runtime.process?.env?.[name] || undefined;
}


export function hasServerEnv(name: string): boolean {
  return Boolean(readServerEnv(name));
}

export function pickServerEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = readServerEnv(name);
    if (value) return value;
  }
  return undefined;
}