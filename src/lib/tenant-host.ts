import { useEffect, useState } from "react";
import { classifyHost } from "@/components/host-router";

/**
 * Returns the tenant subdomain when the current browser host is a tenant
 * host (e.g. `cargordwinetrail.getstampd.com.au`). Returns null on SSR,
 * apex, app, demo, reserved, or unknown hosts.
 *
 * Used by the clean public routes (`/join`, `/venues`, …) to render
 * tenant content without requiring the subdomain to appear in the URL.
 */
export function useTenantSubdomain(): string | null {
  const [sub, setSub] = useState<string | null>(() => readTenantSubdomain());
  useEffect(() => {
    setSub(readTenantSubdomain());
  }, []);
  return sub;
}

export function readTenantSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const cls = classifyHost(window.location.hostname);
  return cls.kind === "tenant" ? cls.subdomain : null;
}
