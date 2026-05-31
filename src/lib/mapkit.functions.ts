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
  let s = raw;
  // Strip BOM if any.
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  s = s.trim();
  // Strip wrapping quotes if user pasted "..." or '...'.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Convert escaped \r\n / \n sequences to real newlines.
  if (s.includes("\\n")) s = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  // Normalise CRLF and stray CR.
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // If headers exist but body is unwrapped (no internal newlines, or only spaces),
  // rebuild canonical PEM with 64-char body lines.
  const beginIdx = s.indexOf(PEM_BEGIN);
  const endIdx = s.indexOf(PEM_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const body = s.slice(beginIdx + PEM_BEGIN.length, endIdx).replace(/\s+/g, "");
    const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
    s = `${PEM_BEGIN}\n${wrapped}\n${PEM_END}`;
  }
  return s;
}

export type MapkitDiag = {
  hasTeamId: boolean;
  hasKeyId: boolean;
  hasPrivateKey: boolean;
  privateKeyLength: number;
  privateKeyStartsWithBeginPrivateKey: boolean;
  privateKeyEndsWithEndPrivateKey: boolean;
  privateKeyLineCount: number;
  normalisedKeyLineCount: number;
  normalisedStartsWithBeginPrivateKey: boolean;
  normalisedEndsWithEndPrivateKey: boolean;
  errorCode: string | null;
  errorMessage: string | null;
};

export type MapkitTokenResponse = {
  token: string | null;
  expiresAt: number | null;
  error: string | null;
  diag: MapkitDiag;
};

export const getMapkitToken = createServerFn({ method: "GET" }).handler(
  async (): Promise<MapkitTokenResponse> => {
    const teamId = process.env.MAPKIT_TEAM_ID;
    const keyId = process.env.MAPKIT_KEY_ID;
    const rawKey = process.env.MAPKIT_PRIVATE_KEY;

    const rawTrimmed = (rawKey ?? "").trim();
    const diag: MapkitDiag = {
      hasTeamId: Boolean(teamId && teamId.trim()),
      hasKeyId: Boolean(keyId && keyId.trim()),
      hasPrivateKey: Boolean(rawTrimmed),
      privateKeyLength: rawKey ? rawKey.length : 0,
      privateKeyStartsWithBeginPrivateKey: rawTrimmed.startsWith(PEM_BEGIN),
      privateKeyEndsWithEndPrivateKey: rawTrimmed.endsWith(PEM_END),
      privateKeyLineCount: rawKey ? rawKey.split(/\r\n|\r|\n/).length : 0,
      normalisedKeyLineCount: 0,
      normalisedStartsWithBeginPrivateKey: false,
      normalisedEndsWithEndPrivateKey: false,
      errorCode: null,
      errorMessage: null,
    };

    if (!diag.hasTeamId || !diag.hasKeyId || !diag.hasPrivateKey) {
      diag.errorCode = "SECRET_MISSING";
      diag.errorMessage = "One or more MapKit secrets are missing.";
      console.error("[mapkit] secret missing", diag);
      return { token: null, expiresAt: null, error: diag.errorMessage, diag };
    }

    const pem = normalizePem(rawKey!);
    diag.normalisedKeyLineCount = pem.split("\n").length;
    diag.normalisedStartsWithBeginPrivateKey = pem.startsWith(PEM_BEGIN);
    diag.normalisedEndsWithEndPrivateKey = pem.endsWith(PEM_END);

    if (!diag.normalisedStartsWithBeginPrivateKey || !diag.normalisedEndsWithEndPrivateKey) {
      diag.errorCode = "PEM_HEADERS_MISSING";
      diag.errorMessage =
        "Private key is missing the -----BEGIN PRIVATE KEY----- / -----END PRIVATE KEY----- headers after normalisation.";
      console.error("[mapkit] PEM headers missing", diag);
      return { token: null, expiresAt: null, error: diag.errorMessage, diag };
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
      const name = err instanceof Error ? err.name : "Error";
      diag.errorCode = name;
      diag.errorMessage = message;
      // Do NOT log key material — only the error name/message.
      console.error("[mapkit] sign failed", diag);
      return {
        token: null,
        expiresAt: null,
        error: `MapKit token signing failed: ${message}`,
        diag,
      };
    }
  },
);
