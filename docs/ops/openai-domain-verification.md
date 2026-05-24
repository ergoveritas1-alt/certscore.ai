# OpenAI Domain Verification

Purpose: OpenAI Admin domain verification for the CertScore workspace.

## DNS record

```text
Type: TXT
Host: @
Value: openai-domain-verification=dv-Ytf3BpLI3fIQCGAN5sz4EoSU
```

## Required environment variables

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ZONE_ID
```

Use a limited Cloudflare API token with DNS edit permissions for the `certscore.ai` zone. Do not use a global API key.

## Command

```bash
pnpm ops:dns:add-openai-verification
```

The command is idempotent. It checks for the exact apex TXT value first, leaves unrelated TXT records untouched, creates the record only when missing, then re-queries Cloudflare to confirm the record exists.

## DNS verification

```bash
dig TXT certscore.ai +short
nslookup -type=TXT certscore.ai
```

## Manual Cloudflare fallback

Cloudflare dashboard -> `certscore.ai` -> DNS -> Records -> Add record -> TXT -> Name `@` -> Content `openai-domain-verification=dv-Ytf3BpLI3fIQCGAN5sz4EoSU` -> TTL Auto or 300 -> Save.

## Final step

Return to OpenAI Admin Console and click "Check Domain."

## Security note

Never commit Cloudflare API tokens, `.env` files, or shell output containing secrets.
