import { createServerFn } from "@tanstack/react-start";
import { SignJWT, importPKCS8 } from "jose";

// Generates a short-lived MapKit JS JWT for Apple MapKit.
//
// SECURITY:
// - MAPKIT_PRIVATE_KEY is read inside the .handler() body so it is never
//   bundled into the client. The handler runs server-only.
// - Only the signed JWT (token) is returned to the browser. The private
//   key, key id, and team id are never echoed in the response.
// - Token TTL is 30 minutes. The browser is expected to refresh via this
//   endpoint before expiry.
//
// SETUP (Lovable → Project Settings → Secrets):
//   MAPKIT_TEAM_ID      e.g. "ABC1234567"
//   MAPKIT_KEY_ID       e.g. "DEF8901234"
//   MAPKIT_PRIVATE_KEY  contents of the downloaded .p8 file (PEM)
//
// .p8 keys are PEM. If the secret store collapses real newlines into the
// literal characters "\n", we normalise them server-side before importing.
export const getMapkitToken = createServerFn({ method: "GET" }).handler(async () => {
  const teamId = process.env.MAPKIT_TEAM_ID;
  const keyId = process.env.MAPKIT_KEY_ID;
  const rawKey = process.env.MAPKIT_PRIVATE_KEY;

  if (!teamId || !keyId || !rawKey) {
    return { token: null as string | null, expiresAt: null as number | null, error: "MapKit is not configured." };
  }

  const pem = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  try {
    const privateKey = await importPKCS8(pem.trim(), "ES256");
    const nowSec = Math.floor(Date.now() / 1000);
    const ttlSec = 60 * 30; // 30 minutes
    const expSec = nowSec + ttlSec;

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
      .setIssuer(teamId)
      .setIssuedAt(nowSec)
      .setExpirationTime(expSec)
      .sign(privateKey);

    return { token, expiresAt: expSec * 1000, error: null as string | null };
  } catch (err) {
    // Do not include key material in the error message.
    console.error("[mapkit] failed to sign token", err instanceof Error ? err.message : String(err));
    return { token: null, expiresAt: null, error: "Failed to sign MapKit token." };
  }
});
