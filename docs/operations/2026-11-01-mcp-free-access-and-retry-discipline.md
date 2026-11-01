# CertScore.ai free MCP access; extra cooldowns deferred — November 1, 2026

The owner wants free anonymous scanning to remain useful, with optional free
authentication for sustained use. After the month-long throttle audit, the
owner approved keeping the reliability fixes and existing limits, deferring
extra retry penalties, and improving invitations and shared-pool recovery.
High volume, new sessions and client-declared names alone do not establish abuse.

## Access and account invitation

Preserve the existing anonymous creation policy in
`apps/web/server/pulse/anonymous-scan-quota.ts`, its shared spend/concurrency
backstops, the existing session capacity and the 30-minute idle expiry. The
earlier restrictive anonymous-trial and five-minute-expiry proposals were
withdrawn. Session eviction retains least-recently-authorized activity ordering;
oldest selection uses one pass instead of sorting the cache.

The first optional account invitation follows the **second** genuinely new scan,
as requested by the owner. Reminders appear at 5, 10, 25 and 50 new scans. The API
session fallback counts distinct bound scan IDs in existing claims, excluding
unbound reservations and prior UTC days. Reused results, polling and report
reads do not trigger the invitation. Shared IP/provider keys cannot establish
a session milestone.

Where clients already supply `openai-conversation-id`, the host can count new
scan IDs across separate transport sessions for that declared conversation.
Only its namespaced HMAC is retained in a bounded process-local UTC-day cache;
raw identifiers are not retained or logged. Client declarations are cosmetic
invitation context, never authenticated identity, quota/admission keys, grants
or abuse signals. Changing a conversation cannot change existing quotas. Cache
state expires at the UTC reset and is capped at 2,000 contexts/10,000 scan IDs;
counting stops after the last reminder. Continuity is best effort across host
restarts, evictions and replicas. Clients without a supplied identifier retain
the API's session fallback. No tracking cookie, new database table, extra API
read or account requirement is introduced.

The invitation appears in existing API/MCP `upgradeMessage` data and MCP scan
TextContent. It preserves scan IDs and the current polling/bundle workflow;
finish that workflow before changing connections. The landing and setup pages
offer free signup and Hosted OAuth setup links. Copy derives existing OAuth
creation allowances from `MCP_FREE_AUTHENTICATION_ALLOWANCE`, also imported by
their enforcement constants. No allowance is increased. Active free-workspace
membership supports the existing OAuth create grant; account activity uses
existing authenticated attribution. Inactive workspaces and nonmembers remain
restricted. Authentication does not reset existing quotas or bypass read limits.
Copy advertises a dedicated workspace allowance and access to existing authorized workspace reports,
rather than uniformly higher limits or bonus credits.

## Shared daily-pool recovery

When the shared anonymous daily pool is exhausted, both the API and MCP error
offer waiting for the UTC reset or optionally creating a free account and
connecting Hosted OAuth for the existing separate workspace allowance. This
offer does not require reaching an invitation milestone; a first-time caller
can be affected by other callers exhausting the shared pool. The response still
denies creation, preserves Retry-After, and says that existing workspace quotas
apply and signup alone does not change the Light endpoint's limit. Shared burst
or concurrency limits are not presented as account-upgrade cues.

## Existing protection; extra cooldowns deferred

The new escalating retry-cooldown implementation, policy and hooks were removed
from the local draft. The original creation quotas, same-site creation cooldown,
read/polling limits, concurrency bounds, Retry-After instructions and safe denial
logs remain. Repeated early retries receive the existing canonical denial;
they do not add a new penalty window. Rejected protected reads still stop before
API activity delivery or report/evidence projection. Anonymous limits and the
30-minute session expiry were not tightened.

## Measuring the free-authentication path

The host emits `mcp_http.free_auth_offer_returned` with only the offer variant
(`intro`, `reminder`, `shared_pool`), context basis and scan decision. It contains
no conversation ID/hash, raw IP, URL, token or user identifier. It measures a
generated tool response, not proof the user viewed an invitation. OAuth
authorizations already produce `oauth_authorized` product analytics; existing
authenticated MCP attribution supports measuring repeat use after sign-in.
Use these for aggregate exposure/authorization/repeat-use trends. There is no
new tracking that attributes an individual anonymous offer to a signup.

Count tool-level rate-limited outcomes as well as HTTP 429s: MCP tool errors can
be carried inside HTTP 200. The retained audit found six throttled scan requests
out of 675 anonymous Light scan calls on two days: five shared daily-pool
denials on October 31 and one one-minute same-site cooldown on October 20.
There were no recorded caller quota, burst, concurrency, read or polling denials.

## Frequency evidence

The read-only production audit covered October 2 through October 31 UTC. It
deduplicated scan IDs marked `new` on anonymous MCP Light scan calls, excluding
canaries and traffic classified internal or automation. It found 528 new scans
across 527 session/day groups; no session/day reached 10, and the maximum was 2.
Fourteen of 310 IP/day groups reached 10, all on October 31. IPs are not people;
unknown traffic classification is included. The service-wide median was nine
new scans per day; October 31 had 200. These are created scan jobs, including
attempts that later failed or produced no-go results, rather than a count of
usable reports or verified human users.

Retained aggregate evidence and SQL fixtures are in
`tmp/mcp-free-auth-20261101/`. No production scans, model calls, report rewrites,
capacity changes or deployment were performed for this revision.

## Validation and cost

Current checks: 219 tests passed, with one existing database-dependent support
test skipped. They cover conversation continuity across sessions and IP changes,
context isolation, bounded memory, UTC reset, duplicate/reused scan exclusion,
optional-hook failure isolation, shared-pool recovery below the invitation
threshold, unchanged denials after early retries, and no rejected-read fan-out.
Shared and MCP builds and web/MCP HTTP typechecks passed. All 14 reliability and
session source/regression files matched the prior reviewed snapshot.

Earlier retained checks also verified free-workspace OAuth eligibility with local
PostgreSQL and the actual invitation SQL's exclusion of duplicate, unbound,
other-session and prior-UTC-day claims. These unchanged paths were not rerun
solely to repeat already successful checks.

Estimated recurring guidance/counting/aggregate-log overhead is below **$0.05/month
at 100,000 scans**, within the disclosed below-$1 preapproval. It adds no model
call, paid service, provisioned capacity or retention policy. Conversation
continuity uses bounded existing process memory and no extra database or API
request. There were no production calls during this implementation revision.
The preceding read-only month-long throttle audit retained its separate
below-$0.10 one-time estimate. Advertising an existing allowance does not expand
it; future allowance/capacity increases need their own cost review.

These are local changes. Deployment still requires the normal clean committed
AWS release path and affected-service verification.
