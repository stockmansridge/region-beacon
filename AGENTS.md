# Project architecture rules

- Public passport item styling uses the versioned registry and allowlisted resolver in `src/lib/public-style-overrides.ts`; never add arbitrary CSS or selector persistence.
- `event_branding.style_overrides` is a sparse optional layer over existing theme fields, so rows without overrides must retain their current rendering.
- Public page previews must render the real public components; controlled preview state may supply safe fixtures but must not duplicate page markup.
- Repeated public records use stable database IDs for style identity; private visitor activity uses non-identifying template slots.