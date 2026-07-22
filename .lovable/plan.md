## Plan

1. **Make Custom Brand Kit an actual selectable state**
   - Turn the current non-clickable Custom tile into a button.
   - When selected, set `brand_kit_key` to `custom` and keep the user’s current colour fields intact.
   - Update the reset/clear behaviour so it does not accidentally re-apply a curated Brand Kit.

2. **Stop Brand Kits from overriding custom colours**
   - Adjust the preview and public theme path so `brand_kit_key === "custom"` behaves as no kit.
   - Add a safeguard in `EventPaletteScope` so custom mode does not count as an active Brand Kit background treatment.
   - Review the legacy `palette_key` overlay path used by the public homepage so a saved curated palette cannot silently replace the explicit blue/brand colours after saving.

3. **Make Event Logo, Cover Image, and Brand Kit minimised by default**
   - Wrap the Event Logo and Cover Image upload controls in collapsible sections.
   - Set Logo, Cover Image, and Brand Kit collapsed by default on page load.
   - Keep all editing controls unchanged once expanded.

4. **Widen and tighten the Live Preview area**
   - Change the editor/preview split so the preview column is wider on large screens.
   - Let the preview content use a responsive two-column layout where space allows, while keeping it inside the available viewport height.
   - Keep the preview pinned on the right and independently scrollable if needed.

5. **Add hover help for each brand colour field**
   - Add a small info icon beside every colour-field label.
   - The hover/focus callout will show the exact field name and what that colour controls, so it is clearer which setting maps to which part of the public page.
   - Keep the existing helper text visible for quick scanning.

6. **Validate**
   - Run the project typecheck after implementation.
   - Use a focused preview/browser check of the branding page to confirm the sections start collapsed, Custom is clickable, and the wider preview fits without blocking the editor.