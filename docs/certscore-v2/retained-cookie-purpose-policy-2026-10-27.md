# CertScore.ai retained cookie-purpose review — October 27, 2026

Owner-authorized local implementation and retained-evidence tests. No deployment,
flag change, new scan, cloud query or historical report rewrite. Public vendor
and publisher documentation and one static vendor script were read without
executing scripts or firing collection endpoints.

## Version and exact rules

New captures use `certscore.cookie-purpose.v8` and cookie-provider resolver
`certscore-cookie-provider-2026-10-27-v6` when this local change is released.
The general request resolver, California qualification, score weights and caps
are unchanged. Preserve v7, including its exact-name handling, C3 coverage,
provider resolver v5 and returned fields; v6 and earlier retain their policies.
Bound v7 and v8 evidence must join their own marker, name, domain, category and
essentiality. A version mismatch stays unknown. Equally authoritative conflicting
observations cannot promote a purpose or provider.

| Exact name and domain | Purpose | Essentiality | Evidence |
| --- | --- | --- | --- |
| `_cc_aud` on `crwdcntrl.net` and its subdomains | Advertising audience data | Non-essential | Lotame's static loader names the cookie; BT's own cookie disclosure describes its audience-profile purpose; Lotame's services notice describes audience-data use. |
| `bcookie` on `linkedin.com` and its subdomains | Security | Unknown | LinkedIn's cookie table specifically documents abuse detection. Necessity on the scanned site is not established by that description. |

Require the cookie's own domain. Do not substitute an ancestor/setter URL, accept
a URL as a cookie domain, match another domain's suffix, trim a name or add a
vendor-wide prefix rule. Local/session storage does not inherit these cookie
identities. Cookie presence does not prove a write, active use, transmission,
California sale/sharing qualification, a registered choice or a legal violation.
Existing source, timing, ancestry, capture and canonical finding guards apply.

Other Lotame names (`_cc_dc`, `_cc_cc`) and ScorecardResearch `UID` remain unknown.
The reviewed sources do not justify assigning each a precise purpose. iRobot's
first-party platform-cookie patterns remain a separate investigation. Preserve
mixed-purpose and ambiguous-identity guards rather than treating a vendor's
business model as the purpose of every cookie.

## Unknown reasons

V8 requires one explicit unknown reason, or null when purpose and essentiality
are resolved: `no_registry_match`, `mixed_purpose`, `ambiguous_identity`,
`missing_context`, `purpose_not_established`, `necessity_not_established`.
These describe the canonical rule's unresolved classification, not a legal
conclusion. Unknown purposes and unknown necessity remain separate. Historical
v3–v7 records must not acquire this new field.

Canonical WC01 inventory normalization can append
`cookie_purpose_unknown:<reason>` to its existing bounded diagnostic codes only
from the successfully bound typed classification. Existing API/Pulse export
paths preserve those codes. Invalid or missing classifications cannot supply a
reason or regain legacy tracking heuristics. No display-only finding is added.

## Source references

- [Lotame vendor script](https://tags.crwdcntrl.net/lt/c/16589/sync.min.js), retained
  SHA-256 `59f4e0057c651cb962d4637e70ff0d239f2b9c2cf4b31345d0145e03320b5b5a`;
  reviewed as bytes, not executed. Its named-cookie list alone does not establish
  the precise purpose of every listed cookie.
- [BT's own cookie disclosure](https://www.globalservices.bt.com/fr/legal/cookies),
  exact `_cc_aud` row; not the blanket company-description table.
- [Lotame services notice](https://www.lotame.com/privacy/services-privacy-notice/),
  audience-data and identifier use; not its separate corporate cookie notice.
- [LinkedIn cookie table](https://www.linkedin.com/legal/l/cookie-table), updated
  August 26, 2026, exact `bcookie` security row.

## Retained verification and rollout boundary

The purposefully selected six-site retained sample contains 260 originally
unknown-necessity cookie records. All 260 reproduce their earlier v7 category,
essentiality, rule, provider and version under the explicit historical policy.
V8 changes two `_cc_aud` write records to advertising/non-essential (Bournemouth
Echo and Korrespondent) and one Roadie `bcookie` write to security with necessity
still unknown. All three have retained before-consent write evidence. Timing
is preserved independently; snapshots are not converted into writes.

The remaining 258 records still have unknown necessity; 257 still have unknown
purpose. The v8 reason inventory is 225 no-rule matches, 16 mixed-purpose, ten
ambiguous identities, two unresolved purposes and five unresolved necessities;
two records are fully classified. This selected sample is not a month-wide
accuracy estimate. Original source hashes/sizes and report identities are checked
again in the replay. Ordinary production improvement remains unverified.

Implementation and results are retained under the daily audit's immutable manual
cookie-purpose run. Tests cover historical reads, source mutations, exact context,
lookalikes, neutral security, non-cookie storage, canonical inventory and prior
Reject scoring/California guards. Local recurring metadata/storage increment is
estimated below $0.10/month at 100,000 scans, disclosed before implementation;
no additional paid usage or capture budget is introduced.
