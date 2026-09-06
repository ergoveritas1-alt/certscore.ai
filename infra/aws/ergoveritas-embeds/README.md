# Same-site embed canary

Adds clearly labelled iframe documents to ErgoVeritas: homepage 1, Legal 2, Privacy 3, Terms 1. Frames contain static explanatory content, no third-party requests or tracking. The existing homepage receives one deferred script; other site content and policies are preserved. Requests to other paths receive no new embeds.

Run `node --import tsx scripts/deploy-ergoveritas-embeds.ts` to prepare and inspect the change. `--apply` uses the canonical ErgoVeritas AWS account, S3 bucket and CloudFront distribution, checks the current homepage ETag before replacement, and invalidates only the affected paths. The before/after documents are retained under `tmp/ergoveritas-embed-deploy`.

Owner requested 1–3 embeds on the first few canary pages on September 6, 2026. Estimated recurring hosting increase is below $1/month at 100,000 visits; bounded same-site HTML and JavaScript only. No additional paid service, model call or provisioned infrastructure.
