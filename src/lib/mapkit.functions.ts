import { createServerFn } from "@tanstack/react-start";
import { SignJWT, importPKCS8 } from "jose";

// Generates a short-lived MapKit JS JWT for Apple MapKit.
//
// SECURITY:
// - MAPKIT_PRIVATE_KEY is read inside the .handler() body (server-only).
// - Only the signed JWT is returned to the browser. The private key, key
//   id, and team id are never echoed in the response.
// - Diagnostics report shape/length only, never key material.
//
// SETUP (Lovable → Project Settings → Secrets):
//   MAPKIT_TEAM_ID      e.g. "ABC1234567"
//   MAPKIT_KEY_ID       e.g. "DEF8901234"
//   MAPKIT_PRIVATE_KEY  contents of the downloaded .p8 file (PEM)

const PEM_BEGIN = "-----BEGIN PRIVATE KEY-----";
const PEM_END = "-----END PRIVATE KEY-----";

function normalizePem(raw: string): string {
  let s = raw.trim();
  // Strip wrapping quotes if user pasted "..."
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  // Convert escaped \n / \r\n to real newlines.
  if (s.includes("\\n")) s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  // Normalise CRLF.
  s = s.replace(/\r\n/g, "\n").trim();

  // If the PEM headers got concatenated onto a single line, rebuild with
  // 64-char body lines.
  if (s.startsWith(PEM_BEGIN) && s.includes(PEM_END) && !s.includes("\n")) {
    const body = s.slice(PEM_BEGIN.length, s.length - PEM_END.length).replace(/\s+/g, "");
    const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
    s = `${PEM_BEGIN}\n${wrapped}\n${PEM_END}`;
  }
  return s;
}

export type MapkitTokenResponse = {
  token: string | null;
  expiresAt: number | null;
  error: string | null;
  /** Safe diagnostics — no key material. */
  diag: {
    hasTeamId: boolean;
    hasKeyId: boolean;
    hasPrivateKey: boolean;
    privateKeyLooksLikePem: boolean;
    privateKeyLength: number;
  };
};

export const getMapkitToken = createServerFn({ method: "GET" }).handler(
  async (): Promise<MapkitTokenResponse> => {
    const teamId = process.env.MAPKIT_TEAM_ID;
    const keyId = process.env.MAPKIT_KEY_ID;
    const rawKey = process.env.MAPKIT_PRIVATE_KEY;

    const diag = {
      hasTeamId: Boolean(teamId && teamId.trim()),
      hasKeyId: Boolean(keyId && keyId.trim()),
      hasPrivateKey: Boolean(rawKey && rawKey.trim()),
      privateKeyLooksLikePem: false,
      privateKeyLength: rawKey ? rawKey.length : 0,
    };

    if (!diag.hasTeamId || !diag.hasKeyId || !diag.hasPrivateKey) {
      console.error("[mapkit] secret missing", { ...diag });
      return { token: null, expiresAt: null, error: "MapKit secret missing", diag };
    }

    const pem = normalizePem(rawKey!);
    diag.privateKeyLooksLikePem = pem.startsWith(PEM_BEGIN) && pem.endsWith(PEM_END);

    if (!diag.privateKeyLooksLikePem) {
      console.error("[mapkit] private key format invalid", { ...diag });
      return { token: null, expiresAt: null, error: "MapKit private key format invalid", diag };
    }

    try {
      const privateKey = await importPKCS8(pem, "ES256");
      const nowSec = Math.floor(Date.now() / 1000);
      const ttlSec = 60 * 30;
      const expSec = nowSec + ttlSec;

      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: keyId!, typ: "JWT" })
        .setIssuer(teamId!)
        .setIssuedAt(nowSec)
        .setExpirationTime(expSec)
        .sign(privateKey);

      return { token, expiresAt: expSec * 1000, error: null, diag };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Do NOT log key material — only the error message.
      console.error("[mapkit] sign failed", { ...diag, errorMessage: message });
      return { token: null, expiresAt: null, error: "MapKit token signing failed", diag };
    }
  },
);
