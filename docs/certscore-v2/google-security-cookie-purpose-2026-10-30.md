# CertScore.ai exact Google security-cookie purpose — October 30, 2026

The next retained cookie-purpose candidate is `__eoi`: 15 records across 15
sites in the October 29 America/Los_Angeles sample of 190 reportable exports.
The higher-frequency Microsoft identities already retain mixed purposes;
their counts do not justify advertising classification. Further historical
confirmation repair needs receipt inputs absent from the retained records.

Google's [published cookie table](https://business.safety.google/adscookies/)
and its linked [CSV](https://business.safety.google/static/assets/csv/adcookies.csv)
identify the exact `__eoi` name, Security purpose, six-month lifespan and partner
domain scope. The reviewed row and complete documentation CSV are retained with
retrieval time and SHA-256 in the manual run's source-review.json. The table
lists several Google products; it does not identify which product set an
individual observed cookie. No particular service is attributed by this rule.

Fresh `certscore.cookie-purpose.v10` recognizes this exact case-sensitive name
on a valid cookie domain as Security. Site-specific necessity stays Unknown,
with `necessity_not_established`. It is neither classified Essential nor
Non-essential. Missing/malformed domain context stays Unknown. No whitespace,
prefix, setter URL or ancestor URL fallback is added. Local/session storage
does not inherit cookie recognition. Exact source name, domain, timing and
observation facts remain intact. No active use, identifier transmission,
registration or legal conclusion is inferred.

V9 is explicitly frozen alongside earlier versions, including its Unknown
`__eoi`, X recognition, provider resolver and required unknown-reason fields.
The provider rules are unchanged, so their resolver remains
`certscore-cookie-provider-2026-10-30-v7`. Only the cookie-purpose writer and
reader contract advance. Existing canonical observation -> normalized concern
-> concern policy -> checklist and scoring paths remain in use. Focused pipeline
checks retain the same checklist outcomes and score effects; Security does not
turn an incomplete inventory into complete coverage.

The hash-verified retained replay covers 190 exports, 2,524 cookie records and
1,911 distinct name/domain identities. All 7,644 explicit v6/v7/v8/v9 comparisons
match the frozen pre-change pending source overlay. Only the 15 `__eoi` fresh
knowledge results change. These records remain partially classified because
necessity is unresolved; this change does not lower the original 80/190 partial
classification count. Historical reports and dashboard results are not rewritten.

Public vendor documentation was read; no scanner target visit, scan, cloud
query, paid service or model/API call occurred. Local paid cost is $0. Expected
incremental deterministic matching and bounded metadata cost after a separately
authorized deployment is below $0.01/month at 100,000 scans with unchanged capture
and retention. No new service/capacity, capture budget, rollout, deployment,
historical rewrite, audit repinning or dashboard publication is included.

Future priority: review exact repeated identities only when primary vendor
documentation supports them, and validate the rollout-held confirmation changes
separately before claiming a production gain. Mixed or undocumented identities
remain unresolved.
