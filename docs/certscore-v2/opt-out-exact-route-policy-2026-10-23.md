# CertScore.ai ten exact-route authorization

The owner approved local implementation and tests on October 23, 2026, sharing
the existing $10/month incremental allowance inside $50. Keep the existing
Lambda and all scan budgets. Exclude Salomon. No deployment, flag changes or
live scans. This approval extends the narrow apex/www policy only for the ten
source-specific routes below; it does not approve a general cross-domain policy.

## Exact grants

Every URL below uses HTTPS. Each arrow is one required server redirect. Paths,
case, trailing slashes, hosts and the Jaguar query are exact. The static registry
is `packages/certscore-contracts/src/sale-sharing-redirect.ts`.

| Original source | Ordered permitted destinations |
| --- | --- |
| `hollisterco.com/` | `www.hollisterco.com/shop/us` |
| `livroreclamacoes.pt/` | `www.livroreclamacoes.pt/Inicio/` |
| `volkswagen.co.uk/` | `www.volkswagen.co.uk/` → `www.volkswagen.co.uk/en.html` |
| `fc-moto.com/` | `fc-moto.com/en-us/` → `www.fc-moto.com/en-us/` |
| `jaguar.com/` | `www.jaguar.com/` → `www.jaguar.com/en-us/index.html?akam_redirect=true` |
| `readcube.com/` | `www.readcube.com/` → `about.readcube.com/` |
| `viadeo.com/` | `viadeo.journaldunet.com/` |
| `ift.tt/` | `ifttt.com/` |
| `gimbal.com/` | `infillion.com/` |
| `cognitiondigital.io/` | `cognitionads.com/` → `www.cognitionads.com/` |

These grants reflect explicit owner authorization, not an inferred assertion of
common ownership. No wildcard, reverse route, alternate source path, alternate
locale, intermediate shortcut or unlisted third hop is added. Jaguar permits
only the exact key/value above; duplicate or extra query parameters fail closed.
Salomon receives no v3 grant. Existing v1 and one-hop v2 semantics remain.

## Enforcement and evidence

The existing feature/intent gates select `bounded_sale_sharing_opt_out.v3-exact-routes`
only when the original target matches this registry. Dispatch retains
`sale_sharing_exact_route.v1`, a route ID and the ordered destination list.
Schema validation rechecks the whole grant against its source. The existing
parent dispatch hash includes the grant.

CDP Fetch interception validates each GET, redirect response and next request
before transport. Only 301/302/303/307/308 redirects can advance the sequence.
Each request must name its immediately preceding request; IDs cannot repeat.
Public-network validation runs before releasing every redirect and again before
continuing its destination request. The isolated context requires native TLS
validation and blocks service workers. Existing network guards remain in place;
this does not claim new socket-level DNS pinning.

A direct successful response at the original exact target remains usable. Once
a redirect begins, only the completed approved route can yield an action target.
A 200 at an intermediate URL is incomplete, not permission to act there. Extra
hops, changed paths/queries, client navigation, URL drift, HTTP errors, invalid
TLS/DNS, deadline exhaustion and malformed ancestry remain limited/neutral.

`certscore.sale-sharing-opt-out-evidence.v3` retains the original scan target,
separate action target, TLS outcome and `sale_sharing_exact_route_proof.v1`, with
one or two ordered hop proofs. Historical v1/v2 evidence cannot acquire v3
authority. A downgrade cannot satisfy a v3 dispatch. No partial chain is promoted
into a completed action document.

The existing worker retains and hashes the schema-verified packet within the
32,000-byte cap. The coordinator verifies original bytes, parent hash, original
target and matching grant before joining. Projection separately verifies the
original scan identity and proven action document, including Jaguar's exact
query. Evidence continues through the canonical typed assessment, normalized
concern, concern policy and unified finding/score flow. No scoring weights,
customer deduction explanations or display fallbacks were added.

## Budgets and cost

The existing Lambda/function configuration and deployment scripts are unchanged.
The checked-in deployment memory is 3,008 MB; live configuration was not queried.
Limits remain 3,000 ms capture, 5,000 ms worker, 4,500 ms artifact deadline, two
control actions, 250 ms grace plus 500 ms observation, 32 request rows and a
32,000-byte packet. No new invocation, browser visit, retry, wait, tail allowance,
model call, worker size, object count or retention extension was introduced.
Additional hop validation consumes the same absolute capture deadline.

Using the prior planning rate at 100,000 scans/month, ten candidates out of 169,
3,008 MB and 0.5–1.5 additional seconds per candidate models **$0.15–$0.43/month
incremental compute**. A hypothetical 100 ms overhead across all scans adds
about $0.49/month. Bounded additional route/grant metadata is under 2 KB, modeling
less than $0.10/month storage at 30-day retention and four copies. Page traffic,
public recovery frequency and actual billed durations remain unmeasured. These
sensitivities share the approved $10 inside $50; they are not a new allowance or
an enforced monthly dollar cap. Local tests incur no recurring infrastructure
increase. Any future rollout needs separate approval and actual cost validation.

## Local verification

The local HTTPS fixtures exercise all ten exact routes using a CONNECT proxy
that maps only fixture hostnames to loopback and rejects every other destination.
No public-site DNS or HTTP requests are made. Native TLS failures are exercised
at the original, intermediate and final hosts. Other tests cover skipped hops,
wrong intermediates, early 200s, query changes/duplicates, third hops, client
navigation, history drift, private/changing DNS answers, wrong request ancestry,
late validation, stalled responses and insufficient capture time.

Contract tests verify all ten complete grants, historical isolation, source
binding, registry-copy isolation and malformed/missing proof. Dispatch tests
preserve server/intent gates and Salomon exclusion. Coordinator tests verify
disabled behavior, ancestry, parent/hash tampering and downgrade rejection.
Retention tests verify written bytes and SHA-256. All ten routes pass persisted
canonical projection with unchanged fixture scoring. Existing observer and
one-hop regressions also pass.

Final verification: **187 tests passed** (34 contracts/transport guard, 29 exact-route
browser checks, 33 projection/dispatch checks, 28 coordinator/retention checks and
63 existing observer regressions). Contracts, scan-core, Lambda and web typechecks
passed. Offline compatibility audits reverified 169 original bundles and their
165 retained action packets using the current schemas, without changing them.

Successful synthetic redirected captures took 836–1,034 ms and retained
1,952–2,339 bytes. A stalled final response stopped at 3,004 ms including cleanup.
These measurements use synthetic already-visible controls, not the real sites.
They do not establish deployed coverage or successful real-world opt-outs.
No existing recipe was widened; unsupported controls remain unsupported.

Logs, historical compatibility audits and the final verification manifest are in
`artifacts/opt-out-exact-routes-2026-10-23/`. No original evidence or historical
report was rewritten. Separate approval remains necessary for Salomon or other
routes, broader recipes, budget/memory increases, deployment, flag changes,
live scans or historical rewrites.
