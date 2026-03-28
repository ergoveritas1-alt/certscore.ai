# Cloudflare Verified Bot Checklist

Manual steps remaining for ConsentCheck:

1. Deploy `consentcheck.site` with `/.well-known/http-message-signatures-directory` live over HTTPS.
2. Confirm the crawler pages are live:
   - `/crawler`
   - `/scanning-policy`
   - `/contact`
3. Confirm the stable user-agent string is live in code and docs:
   - `ConsentCheckBot/1.0 (+https://consentcheck.site/crawler)`
4. Test the key-directory response and signed request formatting locally and against a deployed environment.
5. Submit Cloudflare Bot Submission Form values:
   - bot type: `Verified Bot`
   - verification method: `Request Signature`
   - validation instructions: `Use https://consentcheck.site/.well-known/http-message-signatures-directory`
   - user-agent values: `ConsentCheckBot/1.0 (+https://consentcheck.site/crawler)`
   - user-agent match patterns: `ConsentCheckBot/1.0*`
6. After approval, enable signed requests in production if they are not already enabled.
