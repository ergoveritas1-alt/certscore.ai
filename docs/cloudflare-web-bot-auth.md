# Cloudflare Web Bot Auth

This repo adds the ConsentCheck public key directory, outbound request-signing helpers, and public crawler documentation needed for Cloudflare Verified Bot readiness.

## Environment variables

- `WEB_BOT_AUTH_ENABLED`
- `WEB_BOT_AUTH_PRIVATE_KEY_PEM`
- `WEB_BOT_AUTH_SIGNATURE_AGENT_URL`
- `WEB_BOT_AUTH_EXPIRES_SECONDS`
- `WEB_BOT_AUTH_INCLUDE_NONCE`

## Key generation

Generate a dev keypair:

```bash
npx -y node@22 --import tsx ./scripts/generate-web-bot-auth-key.ts
```

Store the private key as `WEB_BOT_AUTH_PRIVATE_KEY_PEM`. If you use an env file, store it in escaped single-line form with `\n` line breaks.

## Production setup

1. Generate an Ed25519 keypair.
2. Store `WEB_BOT_AUTH_PRIVATE_KEY_PEM` in the active web runtime secret store and any worker runtime secret store.
3. Set `WEB_BOT_AUTH_SIGNATURE_AGENT_URL=https://consentcheck.site/.well-known/http-message-signatures-directory` unless a different public hostname is required.
4. Keep `WEB_BOT_AUTH_EXPIRES_SECONDS` short. `300` seconds is the current default.
5. Keep `WEB_BOT_AUTH_ENABLED=0` until the public key directory is deployed and verified if you want a staged rollout.
6. Set `WEB_BOT_AUTH_ENABLED=1` when production outbound HTTP crawler signing should be active.

## Endpoint verification

Run:

```bash
npx -y node@22 --import tsx ./scripts/print-web-bot-auth-status.ts
```

Then confirm:

- `https://consentcheck.site/.well-known/http-message-signatures-directory` returns `200`
- `Content-Type` is `application/http-message-signatures-directory+json`
- `Signature` and `Signature-Input` headers are present
- the body is a JWKS containing the Ed25519 public key

## Signed request smoke test

Optional helper:

```bash
npx -y node@22 --import tsx ./scripts/test-web-bot-auth-request.ts
```

Interpretation:

- `400`: message formatting is wrong
- `401`: formatting is acceptable but verification failed or the key is not known yet
- `200`: the request verified successfully

## Browser-path follow-up

The current implementation signs HTTP-only crawler requests. Browser-driven traffic should be treated as a follow-up because attaching crawler identity headers to Playwright-driven browser requests needs explicit architecture work to avoid misrepresenting a normal browser session or creating partial coverage across navigations and subrequests.

## Cloudflare submission checklist

Use [docs/cloudflare-verified-bot-checklist.md](/Users/benmasek/WC01/docs/cloudflare-verified-bot-checklist.md).
