/**
 * Public landing description rule — ONE definition, used by every surface.
 *
 * Two different admin fields can supply the paragraph under the hero
 * heading, and they are saved by two different forms:
 *
 *   1. `event_branding.welcome_copy`  — Branding editor → "Welcome copy".
 *      Purpose-written landing/hero copy. Highest priority.
 *   2. `events.description`           — Event Overview form → "Description".
 *      General event description. Used when there is no welcome copy.
 *
 * If both are empty the landing renders NO paragraph — never a hardcoded
 * marketing sentence, because a generic fallback silently looks like real
 * saved content and hides the fact that nothing was written.
 *
 * Surfaces that must use this: the public subdomain landing page, the admin
 * draft full preview, and the Branding editor embedded preview.
 */
export function resolvePublicLandingCopy(input: {
  welcomeCopy?: string | null;
  description?: string | null;
}): string | null {
  const welcome = input.welcomeCopy?.trim();
  if (welcome) return welcome;
  const description = input.description?.trim();
  if (description) return description;
  return null;
}
