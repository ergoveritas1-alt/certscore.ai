# Cookie-purpose classification: local first pass

The owner requested local classification work after an independent review of
nine AI-company websites. Existing scores and reports must remain intact, and
deployment is not authorized.

## Evidence and first broken stage

The retained scans captured the relevant cookie identities. The canonical cookie
knowledge base lacks purpose entries for `aws-waf-token`, `cookieyes-consent`,
`axeptio_cookies`, `axeptio_all_vendors` and `axeptio_authorized_vendors`.
WC01 has some legacy name-based functional exclusions, but typed unknown
essentiality and missing canonical knowledge can still produce review rows.
An exclusion from tracking eligibility is not a positive purpose classification.

Candidate rules now live alongside the canonical knowledge base and are exposed
only through `resolveCanonicalCookiePurposeCandidate`. The normal resolver,
scanner runtime, WC01 concern/policy flow and persisted report reader are
unchanged. Each candidate retains its rule ID, primary source references,
original classification and proposed purpose. Every candidate has
`productionProjectable: false`, `scoreEffect: none` and unknown essentiality.
These are local review artifacts, not new production findings or classifiers.

## Primary references

- AWS documents the exact WAF token name, security challenge use and browser/
  interaction signals: https://docs.aws.amazon.com/waf/latest/developerguide/waf-tokens-details.html
- CookieYes documents its preference cookie:
  https://www.cookieyes.com/documentation/subdomain-consent-sharing/
- Axeptio distinguishes the consent record, declared widget entries and selected
  vendor preferences:
  https://support.axeptio.eu/en/articles/274085-does-axeptio-place-cookies

Purpose does not establish a site-specific consent exemption. In particular,
`axeptio_all_vendors` lists configured entries and is not an acceptance receipt.
`llama_dev_csrf`, generic CSRF names, `country` and `locale` remain unresolved in
this pass because no sufficiently specific purpose reference was established.
Do not broaden the security rule based only on a token-like name.

## Local review command

Supply an array of name/domain metadata only, with at most 512 records:

```sh
pnpm exec tsx scripts/diagnostics/review-cookie-purpose-candidates.ts metadata.json
```

The command has no network, scanner, model, database or score path. It rejects
extra fields, including cookie values. It writes its comparison to stdout.

## Remaining integration work

Before activating these purposes for new scans, bind the chosen registry policy
to typed producer evidence and verify propagation through normalized concerns,
concern policy and checklist/inventory projections. Preserve historical typed
classifications and score versions on read. Essentiality and any resulting future
scoring changes require their own evidence and policy assessment; do not silently
rescore or regenerate the existing leaderboard reports.

## Cost and deployment

This first pass is local, deterministic and uses retained metadata. It adds no
browser visit, model call, AWS invocation, storage setting or recurring cost.
No push, deployment or production write is included.
