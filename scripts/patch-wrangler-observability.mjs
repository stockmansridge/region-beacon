#!/usr/bin/env node
/**
 * Patch the Nitro-generated Cloudflare Worker config to add observability
 * settings. Nitro writes `dist/server/wrangler.json` and a pointer at
 * `.wrangler/deploy/config.json`; `wrangler deploy` uses the JSON one, which
 * overrides the repo-root `wrangler.toml`. So we must inject observability
 * into the generated JSON post-build, otherwise the settings only apply to
 * the (unused) toml.
 *
 * Keep these values in sync with the [observability] block in wrangler.toml.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const targets = [
  resolve("dist/server/wrangler.json"),
];

const observability = {
  enabled: true,
  head_sampling_rate: 1,
  logs: {
    enabled: true,
    head_sampling_rate: 1,
    invocation_logs: true,
  },
};

let patched = 0;
for (const file of targets) {
  if (!existsSync(file)) continue;
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  cfg.observability = observability;
  writeFileSync(file, JSON.stringify(cfg, null, 2));
  console.log(`[observability] patched ${file}`);
  patched++;
}

if (!patched) {
  console.warn(
    "[observability] no Nitro wrangler.json found under dist/server/ — " +
      "skipping. wrangler.toml settings will be used instead."
  );
}
