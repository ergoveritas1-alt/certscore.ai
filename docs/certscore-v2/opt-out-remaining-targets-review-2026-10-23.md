# CertScore.ai remaining changed-target review

Offline investigation, October 23, 2026. No runtime changes, deployment, flag
changes, live scans, AWS calls or historical rewrites. This is a proposal, not
authorization to expand the locally implemented apex/www policy.

The audit reverified all 169 original bundle hashes/sizes and 165 embedded packet
hashes/sizes against retained retrieval receipts. Of 98 changed-target cases,
57 match the previously approved apex/www homepage shape. The remaining **41**
are 2 same-host path changes, 9 apex/www-plus-path changes, 3 other-subdomain
changes, 22 cross-domain changes and 5 non-HTTPS/browser-error destinations.

**Recommend investigating an exact-route implementation for ten cases with at
most two hops.** Salomon is an eleventh candidate only under a separate three-hop
exception. Five additional cases have marginal timing; ten have late responses;
fifteen should remain blocked or unresolved. None is proven recovered.

## How budget suitability was assessed

All proposed routes retain the existing Lambda configuration (3,008 MB in the
checked-in deployment script), 3,000 ms capture, 5,000 ms worker, artifact reserve,
two-control-action maximum, 32 request rows, 32,000-byte packet and single result.
No extra visit, retry, tail wait or shorter observation window is proposed.

The code reserves 1,050 ms for the anchored 750 ms post-confirmation period,
50 ms decision read and 250 ms cleanup. Before opening an entrance it requires
another 250 ms: **1,300 ms remaining**. The direct-submission gate requires
**more than 1,100 ms remaining**. Thus, on a comparable clock, a final response
before 1,700 ms offers entrance headroom, and one before 1,900 ms might offer a
direct-submission opportunity. DOM readiness, geometry, label checks and semantic
reads still consume time before these gates.

The recorded timestamps below are from the independent passive lane, not the
action worker. Their clock/startup, network and page state differ. These are
prioritization screens, not hard predictions or guarantees. A response after
1,900 ms would fail the current submission reserve if the action session behaved
similarly; faster future behavior is unknown. Do not use passive request-span
durations to exclude launch/setup time from the action budget.

The audit also follows retained `redirectedFromRequestId` links and matches
responses to main-document requests. An ordered list of URLs is insufficient.
All proposed routes would require new action-session TLS, public-network and
ancestry checks at every hop before transmission, under the existing deadline.

## Ten candidates for bounded expansion

All routes here are exact source → intermediate(s) → destination grants. Approve
each complete chain, not arbitrary redirects within the same registrable domain.
Each arrow counts as a hop. HTTPS is required throughout.

| Candidates | Retained successful final response | Additional authorization needed |
| --- | --- | --- |
| `hollisterco.com/` → `www.hollisterco.com/shop/us`; `livroreclamacoes.pt/` → `www.livroreclamacoes.pt/Inicio/` | 901 / 1,678 ms; one hop each | Permit these exact public landing paths in the existing one-hop grant. The second has only 22 ms before the illustrative entrance threshold and is a weak timing candidate. |
| `volkswagen.co.uk/` → `www.volkswagen.co.uk/` → `/en.html`; `fc-moto.com/` → `fc-moto.com/en-us/` → `www.fc-moto.com/en-us/` | 754 / 1,096 ms; two hops | Permit these exact two-hop path chains, retaining proof for both hops. No locale/path wildcard. |
| `jaguar.com/` → `www.jaguar.com/` → `www.jaguar.com/en-us/index.html?akam_redirect=true` | 763 ms; two hops | Exact two-hop chain plus the single reviewed query key/value. Reject other, duplicate or additional parameters. The raw retained response/request establishes `true`; the transport summary redacts its value. |
| `readcube.com/` → `www.readcube.com/` → `about.readcube.com/` | 1,561 ms; two hops | Explicit delegation to the named subdomain and both hops. Same registrable domain alone is not authority for arbitrary subdomains or tenants. |
| `viadeo.com/` → `viadeo.journaldunet.com/`; `ift.tt/` → `ifttt.com/`; `gimbal.com/` → `infillion.com/` | 1,346 / 1,435 / 874 ms; one hop | Separately approve each cross-domain mapping after destination ownership/operator or explicit delegated-authority review. A server redirect, similar branding or a shared certificate is not sufficient authorization. |
| `cognitiondigital.io/` → `cognitionads.com/` → `www.cognitionads.com/` | 829 ms; two hops | Approve the cross-domain mapping and exact second hop under the same destination-authority requirement. |

The least extensive next step is the two single-hop path grants. Two-hop grants,
the Jaguar query exception, ReadCube subdomain delegation and cross-domain
delegations are independently selectable approvals, not an all-or-nothing bundle.

**Optional eleventh:** `salomon.com/` → `www.salomon.com/` →
`www.salomon.com/en-us/` → `www.salomon.com/en-us`, final 200 at 1,170 ms.
This needs an explicit **three-hop** chain exception, including the trailing-slash
redirect. Do not skip the intermediate requests or silently authorize three hops
globally. Retained timing makes it plausible, but it exceeds the proposed two-hop
default.

Only Salomon, Jaguar, ReadCube and Gimbal among these eleven retain passive
OneTrust recognition; Jaguar also retains TrustArc recognition. The current
sale/sharing registry defines a OneTrust explicit recipe only. Recognition is
neither a uniquely actionable recipe nor a verified GPP transition. The other
seven have no retained CMP runtime recognition; that is unknown, not proof of
absence. No recipe expansion or control mutation beyond the existing recipe is
authorized by any redirect grant.

## Remaining thirty cases

| Group | Cases and retained outcome | Disposition and authorization |
| --- | --- | --- |
| Marginal timing: 5 | `nubia.com` → `intl.nubia.com`: 1,705 ms, 3 hops via www and mall; `tu-bs.de` → `www.tu-braunschweig.de`: 1,719 ms, 1 hop; `securid.com` → `www.rsa.com`: 1,728 ms, 1 hop; `dbschenker.com` → `www.dsv.com/en`: 1,744 ms, 2 hops via www.dbschenker.com; `tele.dk` → YouSee help article: 1,893 ms, 1 hop. All final 200. | No entrance headroom on the illustrative clock; only an already-visible supported submit could potentially fit. Need exact subdomain/three-hop approval for Nubia, reviewed cross-domain grants for the others, and two-hop approval for DB Schenker. A new budget is not justified by this evidence. Tele.dk has only 7 ms before the illustrative direct-submit threshold and should be very low priority. |
| Late same-domain pages: 3 | `weathernews.com/weather/`: 2,961 ms, 1 hop; `www.jinr.ru/main-en/`: 2,318 ms, 2 hops; `www.mature.nl/en/home`: 2,026 ms, 2 hops. Final 200. | Exact path/hop grants could make navigation authorized but would not solve the retained timing. Keep limited under current caps. A longer capture or shorter required window is a distinct, unapproved change; do not propose shortening evidence requirements. |
| Late cross-domain pages: 7 | Elkdata → Domeen 2,091 ms; Telecom.sk → Telekom.sk 2,093 ms; Nsprimario → Ervers 2,680 ms; Etisalat → Eand 2,966 ms; Actalis.it → Actalis.com/it/ 4,827 ms; Squadhelp → Atom 1,998 ms; Webonic → Websupport 2,748 ms. One hop each, final 200. | Each needs an independently reviewed exact cross-domain grant. None clears the illustrative submission gate. No recovery claim and no budget expansion recommended. |
| Same-domain blocked/special destinations: 3 | Urfu `/ru/` returned 403; Portal Inmobiliario reached `/gz/account-verification` with redirect/session query values (200); Irresponsible-smoke reached a tokenized subdomain path (401). | A 200 verification page is not a representative target. Keep blocked/limited. Do not add verification bypass, login, form submission, wildcard queries or token replay. A future exception would require a separate representative-page and interaction design, not just redirect approval. |
| Cross-domain blocked/unresolved: 7 | Cruisecritic final 403; Bansos final 403; CoverMyMeds repeated 429 at 16,126/16,864 ms with incomplete original ancestry; P9slot reached a parameterized download URL with 403 and no original server-redirect ancestry; Olxhut has 5 hops across different domains, final 200 at 3,150 ms; Epichosted has a chain starting on HTTP, final 200 at 2,417 ms; Bolly-in has disconnected request ancestry despite a final 200 at 1,465 ms. | Keep blocked/unknown. Do not bypass errors, infer missing ancestry, authorize HTTP, adopt a fresh navigation as a continuation or expand arbitrary cross-domain chains. Separate site-specific evidence and authority review would be prerequisites to proposing any exception. |
| Non-HTTPS/browser error: 5 | Goodimpressioncrboost, Rtb-stellormedia, Talaria and Zipthelake end at `chrome-error://chromewebdata/` after retained 404s; Aslwls ends at HTTP with 403. | No redirect-authorization expansion recommended. A browser error page is not a target. Never grant authority to it; do not downgrade HTTPS. Diagnostics may distinguish these outcomes without widening interaction authority. |

## Implementation and spending authorization, if selected later

An approved expansion would version the dispatch and evidence contract. Include
the exact ordered route in the parent dispatch hash, keep original and action
targets distinct, bind each response to the next request, and reject any
unlisted hop before transport. Carry the verified packet through the existing
canonical join/assessment/projection; keep old v1/v2 semantics unchanged. Tests
must cover wrong intermediate targets, extra hops, query duplication, invalid
TLS/DNS, broken ancestry, deadline exhaustion and the unchanged packet cap.

The current $10 authorization is for apex/www homepages. **Explicitly extend its
scope to the chosen path/subdomain/query/cross-domain grants**, sharing the same
$10 ceiling inside $50; do not assume unused allowance authorizes new targets.
Using the prior planning rate and current 3,008 MB configuration, ten candidates
out of 169 at 100,000 scans/month and 0.5–1.5 additional seconds per candidate
model approximately **$0.15–$0.43/month compute**; including Salomon models
$0.16–$0.48. A 100 ms overhead on every scan would add about $0.49. Evidence
storage should remain below $0.10/month with bounded additional hop proof and
the unchanged packet cap. Traffic and recovery frequency remain unmeasured.
These are incremental sensitivities for the expansion, not a production quote,
and must share—not increase—the existing allowance.

The lower-cost alternative is to retain the current exact-target/apex-www policy
and improve offline failure categorization. No recurring-cost change was made in
this investigation. Deployment, flags, live calibration, budget/memory changes,
new recipes and historical rewrites remain separate approvals. This report does
not request any of those actions now.

## Reproduction

Run `node artifacts/opt-out-remaining-targets-2026-10-23/analyze.cjs` from WC01.
The local script verifies receipt hashes and emits all 41 scan IDs, original
hashes, redacted destinations, passive response inventories, ancestry and timing
screens to `analysis.json`. It makes no network requests. Tokenized paths and
query identifiers are redacted in the new outputs. Existing original artifacts
remain untouched. The accompanying verification record hashes the analysis,
script and this report.
