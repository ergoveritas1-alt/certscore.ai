# Unknown vendor prevalence audit

This read-only operational audit ranks unresolved, repeated third-party request endpoints from the most recent completed scans. It is a discovery tool for the canonical resolver; it does not write to the production database, create registry rows, or generate resolver rules.

## Run

After the validation-worker image that contains `unknown-vendor-prevalence` has been deployed through the normal worker release path, run the approved ECS psql one-off wrapper:

```bash
pnpm tsx scripts/run-prod-db-audit-ecs.ts \
  --audit unknown-vendor-prevalence \
  --input-json '{"scanLimit":1200,"candidateLimit":100,"notes":"canonical vendor discovery"}'
```

The input has hard bounds: `scanLimit` is 1–1200 and `candidateLimit` is 1–500.

## What the audit accepts

- Retained request/script/response observations with a concrete HTTP(S) URL.
- Evidence explicitly marked third-party, or whose exact host appears in `third_party_request_domains`.
- Exact hostname clusters only. It never derives a parent domain or vendor from the hostname.

It passes each observation through the current canonical resolver before ranking. Any canonical match is excluded. Cookie names may be shown only when future retained evidence ties them to the same endpoint; cookie-only and host-only observations are not candidates.

The result removes query strings and fragments, redacts dynamic path segments, bounds samples, and returns a ranked `deterministic_review` or `observe_more` queue.

## Promotion workflow

1. Take a ranked `deterministic_review` candidate.
2. Collect retained request evidence and independently confirm the product owner and exact endpoint semantics from primary vendor documentation.
3. Add a narrow typed rule in `packages/certscore-vendor-resolver/src/index.ts` plus positive and negative fixtures.
4. Re-run the candidate audit: the new canonical match should disappear from the unresolved queue.
5. Run resolver tests/typecheck and the relevant deployment preflight before normal review, commit, and release.

Do not import the queue into `vendor_registry`, treat a host as a vendor identity, or promote an LLM-only label. The canonical resolver remains the sole registry of deployed rules.
