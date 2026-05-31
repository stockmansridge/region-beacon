# MapKit Worker Secrets (production)

The public Trail Map and admin venue picker use Apple MapKit JS. The browser
fetches a short-lived JWT from the `getMapkitToken` server function
(`src/lib/mapkit.functions.ts`), which is signed with Apple-issued
credentials read from `process.env`.

## Where secrets live

| Environment              | Host                                | Secret source                          |
| ------------------------ | ----------------------------------- | -------------------------------------- |
| Lovable preview          | `*.lovable.app`                     | Lovable-managed project secrets (auto) |
| Lovable published        | `region-beacon.lovable.app`         | Lovable-managed project secrets (auto) |
| Production tenant hosts  | `getstampd.com.au`, `*.getstampd.com.au` | **Cloudflare Worker secrets** on the self-deployed `region-beacon` Worker |

Lovable-managed secrets are **not** synced to the self-deployed Cloudflare
Worker. The production Worker therefore needs its own copy of every secret
the runtime reads via `process.env.*`.

## Required Cloudflare Worker secrets

Bound on the `region-beacon` Worker (the one that serves
`*.getstampd.com.au`):

- `MAPKIT_TEAM_ID` — Apple Developer Team ID (JWT `iss`)
- `MAPKIT_KEY_ID` — MapKit JS Key ID (JWT `kid`)
- `MAPKIT_PRIVATE_KEY` — full PEM contents of the downloaded `.p8`
  (must include `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`
  headers; literal newlines or escaped `\n` are both accepted — see
  `normalizePem` in `src/lib/mapkit.functions.ts`)

### Set / rotate

```bash
wrangler secret put MAPKIT_TEAM_ID      --name region-beacon
wrangler secret put MAPKIT_KEY_ID       --name region-beacon
wrangler secret put MAPKIT_PRIVATE_KEY  --name region-beacon
```

For `MAPKIT_PRIVATE_KEY`, paste the entire `.p8` contents including the
BEGIN/END header lines when prompted.

### Verify

```bash
wrangler secret list --name region-beacon
```

Then load `https://<tenant>.getstampd.com.au/map`, click **Copy support
details** if the map fails, and confirm the diagnostic payload reports:

```
hasTeamId: true
hasKeyId: true
hasPrivateKey: true
```

If any of those are `false`, the secret is missing on the Worker (not on
Lovable). Re-run `wrangler secret put` against `region-beacon` and redeploy.

## Security notes

- The `.p8` is a long-lived signing key. Never commit it, never bundle it
  into the client, never return it from an endpoint. It must only ever
  exist as a Cloudflare Worker secret (and as a Lovable secret for the
  preview host).
- `getMapkitToken` returns only the signed JWT and a shape-only diagnostic
  block. Key material is never echoed in responses or logs.
- Rotate the `.p8` at Apple Developer → Keys, then re-run the three
  `wrangler secret put` commands above. The old key keeps signing valid
  JWTs until rotated out on Apple's side.

## Related

- `src/lib/mapkit.functions.ts` — token signer + diagnostics
- `src/lib/mapkit-loader.ts` — browser-side MapKit JS loader
- `docs/plans/apple-mapkit-venue-picker.md` — original plan
- `wrangler.toml` — Worker config (`region-beacon`)
