# Complete live-preview colour guidance

## Goal
Make every visible area in the Branding live preview identify the colour setting that controls it, not only the few items with hand-written hover labels.

## Changes
- Upgrade the preview hover tool to inspect the item under the pointer and match its text, background, and border colours to the event’s semantic colour settings.
- Keep existing specific labels for images, logo, hero overlay, and other non-colour controls.
- Show an immediate on-preview label instead of relying only on the browser’s delayed tooltip.
- Add explicit mappings to major landing-page sections and controls where several colour roles work together.
- Ensure the helper is confined to the admin live preview and cannot affect the public customer page.

## Validation
- Check representative hero, navigation, progress, card, button, link, and page-background areas in the live preview.
- Confirm the app type-checks and the preview build reports no errors.
