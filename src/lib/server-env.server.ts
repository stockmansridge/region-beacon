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

export function readServerEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    Deno?: DenoLike;
    process?: ProcessLike;
  };

  try {
    const denoGet = runtime.Deno?.env?.get;
    if (typeof denoGet === "function") {
      const value = denoGet(name);
      if (value) return value;
    }
  } catch {
    // Ignore unavailable env accessors and try the next runtime shape.
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