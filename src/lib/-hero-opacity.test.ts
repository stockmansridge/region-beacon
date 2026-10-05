import { expect, test } from "vitest";
import { publicStyleTarget, validatePublicStyleOverrides } from "@/lib/public-style-overrides";
test("passport hero opacity 0/100 survive; surface opacity not allowed", () => {
  const doc = validatePublicStyleOverrides({ version: 1, items: {
    "passport.hero.overlay": { normal: { opacity: 0 } },
    "passport.hero.image": { normal: { opacity: 1 } },
    "passport.hero.surface": { normal: { opacity: 0.4, backgroundColor: "#112233" } },
  } }).document;
  expect(publicStyleTarget(doc, "passport.hero.overlay").style.opacity).toBe(0);
  expect(publicStyleTarget(doc, "passport.hero.image").style.opacity).toBe(1);
  expect(publicStyleTarget(doc, "passport.hero.surface").style.opacity).toBeUndefined();
  expect(publicStyleTarget(JSON.parse(JSON.stringify(doc)), "passport.hero.overlay").style.opacity).toBe(0);
});
