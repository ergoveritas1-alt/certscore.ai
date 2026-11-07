# CertScore.ai Red Hat post-click reload verification

Owner-authorized local work, November 5, 2026. **The post-click navigation is an
exact same-page reload, and a recorded explicit choice was verified in the
replacement document within the existing three-second cap.** This establishes
terminal choice recording after the opt-out button click, not sale/sharing
effectiveness or downstream tracking cessation.

## What the two visits established

The identification visit retained the first post-click browser navigation events
and document request while continuing to block that request. Both browser events
reported `reload`; the requested destination was exactly
`https://www.redhat.com/en`, with no query or fragment, in the main frame, using
GET. It was not an external destination or form-submission navigation. The button
was clicked at 1,607 ms, the immediate TrustArc read was asserted `[1]` at 1,638 ms,
and the reload request was intercepted at 2,038 ms. Because that visit still
blocked the reload, it did not establish terminal persistence.

The separately tested verification visit allowed that one exact reload:

| Checkpoint | Evidence |
| --- | --- |
| Baseline, 1,473 ms | Original document; TrustArc implied `[0]`, no recorded preference |
| Click, 1,479 ms | One native button with the exact visible/accessibility opt-out label, verified portal identity and hit target |
| Immediate read, 1,487 ms | Still implied `[0]`; confirmation pending |
| Reload request, 1,911 ms | Browser-reported reload; exact same page; new request joined to the action and original document |
| Continued reload, 1,914 ms | Native TLS/public-network checks; HTTP 200; no redirect; replacement loader verified |
| Terminal read, 2,239 ms | Replacement document; TrustArc asserted `[1]` |
| Capture / cleanup complete | 2,241 / 2,245 ms, within 3,000 / 3,250 ms |

The original 301 apex-to-www redirect and final 200 were retained separately from
the subsequent reload's 200 response. The replacement document token differs from
the original token and matches the loader bound through Network and Fetch events.
The full anchored follow-up lasted 753 ms. Terminal API readiness used one passive
descriptor check and no SDK invocation. Combined initial/terminal readiness used
10 of 32 checks and 1 ms rounded processing within the shared 10 ms allowance.
There were three SDK reads in the verification visit and two in identification.

Do not combine the first visit's immediate asserted state with the second visit's
terminal read. In the verification visit alone, the first observed confirmation
was the terminal read. The actual moment the state changed remains unknown.
Category index `[1]` is retained as an observed category value; no sale/sharing
purpose mapping is inferred from its number.

## Local implementation

The navigation recorder retains only bounded post-action CDP metadata. It strips
query values and credentials, hashes the full bounded URL, and caps its output at
2,048 bytes inside the existing 32,000-byte packet cap. It does not continue
requests or change their authorization.

The reload diagnostic permits at most one main-frame GET to the exact reviewed
URL after a verified native opt-out click. Both scheduled/requested browser events
must identify a reload and bind to the original action/document. The Fetch request
must join the same Network request and a different loader. Public-network checks
and native TLS remain in place. Only a 200 response with no Location header can
commit the verified replacement document. Other paths, query strings, fragments,
frames, POST bodies, form navigation, redirects, missing/stale bindings and second
reloads fail closed. No extra click or SDK mutation is introduced.

Every SDK read records its document token. A read crossing the document change
is discarded. The one terminal read can use passive API readiness in the verified
replacement document, sharing the remaining 32-check/10 ms readiness allowance.
Its cutoff is 2,700 ms, preserving the existing 50 ms read and 250 ms reserve;
there is no additional SDK read, polling loop, capture-cap increase or second
navigation retry. The existing minimum 750 ms follow-up is preserved.

## Confirmation versus an observation window

The retained live packet's older `choiceRegistered` flag remains false: that
diagnostic flag requires matching asserted state immediately after the click and
at the terminal checkpoint. Its `terminalCategoryChangeObserved` flag is true.
Neither the packet nor this historical flag was rewritten.

The checksum-bound internal `redhat.terminal-choice-review.v1` assessment makes
the distinction explicit: `terminalChoiceRecorded=true`, confirmation phase
`terminal_after_verified_same_page_reload`, read checkpoint 2,239 ms, and zero
verified post-confirmation observation milliseconds. This is a local diagnostic
review, not a new canonical production assessment, finding, score or dashboard
promotion. It must not be interpreted as a successful post-confirmation tracking
observation window or proof that sale/sharing stopped.

## Verification and scope

Eight runtime/fixture tests passed, including 20 action browser scenarios, an
owned navigation-blocking browser test and an owned native-reload browser test.
The reload cases reject alternative URLs, forms, redirects, frames, stale/missing
proof and late requests. Cross-document reads and terminal-only confirmation have
separate regression cases. Two retained-evidence tests passed, including the
actual live packet and tampering with hashes, control/source proof, redirect
ancestry, reload identity, terminal state and timing. TypeScript, registry checks
and whitespace checks passed.

Four original Red Hat artifacts and both new live packet receipts were verified.
The observed execution source was pinned before each visit. Both visits used the
canonical target selector after a successful central contact export, applied the
owner's cooldown waiver, and preserved all contact holds. Both attempts were
recorded centrally with distinct idempotent keys and in the repository ledger.
Disconnected AWS waiters were recovered from their existing tasks. Local egress
geography was not independently verified; these two visits do not establish a
population success rate.

Accept and Reject, production scanner callers/recipes/flags, capture budgets,
worker memory, scoring and historical reports remain unchanged. No deployment
or production activation occurred. The same-page reload support is local and
specific to the verified Red Hat diagnostic. Estimated recurring cost increase:
$0. One-time contact-ledger bookkeeping: below $0.10.

The evidence supports preparing a production recipe that separates terminal
choice recording from post-confirmation observation coverage and preserves the
exact one-reload binding. It does not justify a generic navigation allowance or
an automatic production rollout.

Artifacts:
`outputs/redhat-navigation-identification-2026-11-05/` and
`outputs/redhat-reload-verification-2026-11-05/`.
