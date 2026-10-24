# CertScore.ai one-hop apex/www authorization

Owner approval, October 23, 2026: implement and test locally, using the existing
Lambda and scan budgets, with up to $10/month incremental **inside** the existing
$50 envelope. No deployment, flag changes or live scans. This narrowly supersedes
the apex/www approval requirement in the earlier navigation investigation; its
other restrictions remain.

## Authorized behavior

Only the existing sale/sharing opt-out worker can receive the new
`bounded_sale_sharing_opt_out.v2-apex-www` dispatch. Existing enablement and
interaction-authorization gates still apply. The dispatch retains its original
scan ID and exact target and grants precisely one counterpart URL. It grants no
host wildcard and does not copy a passive lane's final URL.

- Both targets are canonical HTTPS root URLs, without credentials, custom ports,
  query or fragment. Only registrable-domain apex ↔ www is eligible. Pinned
  `tldts` 7.4.2 checks the public suffix and excludes private tenant suffixes,
  unknown suffixes, IPs, other subdomains and invalid DNS-name lengths.
- A browser-native GET may follow one 301, 302, 303, 307 or 308 response to that
  exact counterpart. A direct successful original-target response also works.
  Other targets, paths, protocols, extra hops, loops, ambiguous Location headers,
  HTTP errors and non-GET document requests fail closed.
- CDP Fetch interception checks the initial request, redirect response and
  destination request. It checks the destination before releasing the redirect
  response and checks public DNS answers again before continuing the destination
  request. Playwright routing alone does not intercept every redirect hop.
  The existing public-network guard still applies to other requests. This does
  not introduce socket-level DNS pinning or claim a new network isolation layer.
- The isolated v2 context requires native TLS validation and blocks service
  workers. Subframes and further document navigations cannot become action
  targets. Client redirects, reloads and URL drift invalidate the action binding.
- Existing reviewed recipes, unique-control checks, geometry, semantic opt-out
  confirmation and the complete anchored observation window still apply. A
  permitted redirect alone creates no finding and proves no working opt-out.

## Evidence and canonical processing

`certscore.sale-sharing-opt-out-evidence.v2` retains the original authorization,
separate action target, TLS outcome, redirect status and browser Fetch request
ancestry. It preserves the original target, scan ID and parent dispatch hash.
Missing or malformed proof remains limited/neutral. A v1 packet cannot satisfy a
v2 dispatch, and historical v1 packets cannot acquire redirect authority.

Retention rejects packets exceeding the existing 32,000-byte cap before local
or S3 writes. The coordinator verifies original bytes, metadata, scan/target,
parent hash and policy/grant before joining. Canonical projection verifies the
original scan target and permits the separately proven action document. Existing
typed assessment → normalized concern → concern policy → unified finding/score
processing remains; there is no display fallback or scoring-policy change.

## Resource limits and estimated cost

No function selection, deployed configuration, memory setting, flag or deployment
script was changed. The checked-in deployment script specifies **3,008 MB**;
live AWS configuration was not queried. The existing 4,096 MB validation ceiling
is not approval to resize a worker. The earlier investigation's “at most 4 GB”
wording described that ceiling, not the requested or deployed worker size.

Limits remain 5,000 ms worker, 3,000 ms capture, 4,500 ms artifact deadline, two
control actions maximum, 250 ms grace plus 500 ms observation, 32 retained request
rows and a 32,000-byte packet. There is no extra invocation, lane, browser visit,
retry, model call, tail wait, larger worker or retention extension. Public-DNS
validation and redirect processing consume the existing deadline.

For planning at 100,000 scans/month, 3,008 MB is 2.9375 GB. Using the AWS Lambda
x86 baseline of $0.0000166667/GB-second, and the historical candidate fraction
57/169, an additional 0.5–1.5 seconds per candidate would cost approximately
**$0.83–$2.48/month in compute**; three seconds would cost about $4.95. An assumed
100 ms of validation overhead on every scan adds about $0.49/month. These are
sensitivity estimates, not measured production durations or recovery rates.
See [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/).

New proof metadata is bounded below 2 KB per packet by DNS-name and request-ID
limits; at 100,000 scans, 30-day retention and four retained copies, incremental
storage is estimated below $0.10/month. No extra S3 object or API/model purchase
is introduced. Redirected page traffic is unmeasured and must fit the remaining
$10 allowance. A different cohort can cost more: three extra seconds on every
scan would be about $14.69 compute alone. Unchanged per-scan caps do not enforce
a monthly dollar ceiling. Validate actual cost before any separately authorized
rollout; do not spend beyond $10 or treat it as $10 on top of $50. Local fixtures
and offline audits incurred no recurring infrastructure increase.

## Verification and remaining approvals

Local tests cover both directions and all supported status codes, direct loads,
destination blocking before transport, private DNS answers and changed answers,
invalid source/destination TLS, wrong ancestry, duplicate Location headers,
second hops, client redirects, history drift, deadlines and packet size.
Coordinator tests cover disabled lanes, hash/target tampering, invalid redirect
proof and v1/v2 downgrade attempts. Projection tests check persisted binding,
existing canonical findings and unchanged fixture scoring. Earlier observer,
navigation and recipe regressions are included.

142 tests passed. Contracts, scan-core, Lambda and web typechecks passed. Offline
audit reverified all 169 original bundles and their 165 retained action packets
without upgrading or rewriting them. Test logs and source hashes are retained in
`artifacts/opt-out-redirect-policy-2026-10-23/`. Successful local redirected
fixtures completed in 829–854 ms with packets of 1,896–1,905 bytes; these local
measurements exclude public-site latency and cold-start behavior.

The earlier 98 changed-target cases contain 57 apex/www homepage candidates,
14 other same-registrable-domain changes, 22 cross-domain changes and five
non-HTTPS/error destinations. Even among the 57, passive evidence includes
10 final 403s and two 404s. None is claimed recovered by this local work.

Separate approval is still required for deployment, any flag change, live
calibration scans, another host/path/protocol policy, extra hops, retries, wider
interaction recipes, increased budgets or memory, historical rewrites, or cost
beyond the approved envelope. The lower-cost alternative remains exact-target
failure diagnostics with no redirected action. No further approval was needed
to complete this local implementation.
