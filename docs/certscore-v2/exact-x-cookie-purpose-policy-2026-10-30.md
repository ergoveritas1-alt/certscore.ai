# CertScore.ai exact X cookie-purpose coverage — October 30, 2026

Following the local consent evidence, confirmation and policy-content fixes,
the next reviewed priority is exact cookie-purpose coverage. The October 29
retained sample has twelve unresolved records across six sites for two
documented X identities. Each record retains before-consent header-write
evidence. The fixtures preserve original names, domains, timing, source scan
identity and public export hashes; they contain no raw cookie values.

[X's own cookie table](https://help.x.com/en/rules-and-policies/x-cookies),
reviewed October 30, identifies these exact names and domains:

| Cookie name | Cookie domain scope | New technical classification |
| --- | --- | --- |
| `muc_ads` | `t.co` and its subdomains | Advertising, non-essential |
| `personalization_id` | `twitter.com` / `x.com` and their subdomains | Personalization, non-essential |

X documents advertising for the first and personalization across on-platform and
off-platform activity for the second. The latter does not acquire an advertising
purpose. The generic vendor-purpose contract has no personalization category,
so its cookie-specific attribution remains Unknown there while the typed cookie
purpose is Personalization. Existing X Corp. entity/service identities are reused;
no request endpoint, SDK identity, service capacity or capture recipe is added.

Fresh classification uses `certscore.cookie-purpose.v9` with cookie provider
resolver `certscore-cookie-provider-2026-10-30-v7`. V8 is frozen explicitly,
including its unknown reasons and provider resolver v6; v6/v7 reader behavior
also remains available. Names are exact and case-sensitive. Require the cookie's
own valid domain; no setter/ancestor URL fallback, URL-as-domain, suffix spoof,
trimmed-name or wildcard-prefix match. Local/session storage does not inherit
these cookie rules. Missing context remains unknown.

Microsoft `MUID`, `MR`, `SM`, `ANONCHK`, `SRM_B` and other ambiguous identities
remain unresolved under their existing rules. The largest unknown counts do not
establish a documented advertising purpose for each cookie. No vendor-wide
promotion or new California sale/sharing qualification is made.

Positive classification follows existing typed observation, normalized concern,
concern policy and canonical checklist paths with unchanged weights and guards.
Presence is distinct from a write, active use, collection purpose, registration,
or a legal conclusion. Historical reports, classifications and policy effects
are not rewritten. Retained public bytes are only replay inputs for proposed
fresh v9 classification, not newly materialized reports.

Validation: 71 focused tests pass across purpose/provider rules, version binding,
canonical storage pipeline and journey projection. Contract, resolver and
focused web/scanner/test typechecks pass. Twelve retained rows replay under v9;
six advertising rows and six personalization rows change classification. The
same frozen 190-export sample contains 2,524 cookie records and 1,911 unique
name/domain identities. All 5,733 explicit v6/v7/v8 classification comparisons
match the frozen pre-change resolver exactly. No other fresh-purpose change was
observed in that sample. This is not a fleet coverage or production improvement.

Local paid usage is $0. Only public vendor documentation was read; no scanner
target visit, scan, privacy action, cloud query or model/API call was made.
No deployment, capture-budget increase, historical rewrite, dashboard publication
or repinning occurred. Expected incremental deterministic matching and bounded
metadata cost after a separately authorized deployment is below $0.01/month at
100,000 scans, with no new service, capacity or retention allowance.
