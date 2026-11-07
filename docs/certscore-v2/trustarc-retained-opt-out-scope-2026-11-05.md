# CertScore.ai TrustArc retained opt-out scope

November 5, 2026. Retained-only investigation following the owner's “next”.
No scanner action recipe, deployment, flag change, model call or public visit.
Accept/Reject and every capture/time/memory cap remain unchanged.

## Result

All three TrustArc controls in the frozen cohort are supported by original,
checksum-verified first-layer geometry and matching document identity. The
prior summary was correct about presence. The public exports alone omitted the
native control detail; the recovered originals provide it. None of the three
originals establishes a complete explicit opt-out action and state transition.

| Site | Original first-layer evidence | Recipe implication |
| --- | --- | --- |
| Battlelog | Visible native `button#truste-show-consent`, “Your Privacy Choices”, within `#truste-consent-buttons`, on `https://battlelog.battlefield.com/bf4/gate/`. Accept and Decline coexist. | A choices entrance, not proof of direct opt-out submission. The requested `https://battlelog.com/` differs from the observed document. |
| Ustream / IBM Video Streaming | Visible native `button#truste-show-consent`, “Do not sell or share my personal information”, within `#truste-consent-buttons`, on `https://video.ibm.com/`. Accept All coexists. The banner states this requests required cookies only. | Strong candidate for explicit-choice investigation. The same selector as Battlelog does not establish the same action. The requested `https://ustream.tv/` differs from the observed document. |
| Red Hat | Native button with an original AX backend-node binding and matching visible geometry at `div.pdynamicbutton button`, “Do Not Sell or Share My Personal Information”, on `https://www.redhat.com/en`. | A separate first-layer button, in addition to the combined footer preferences link. The original AX record does not retain a reusable action locator; the broad geometry selector alone is insufficient. The requested `https://redhat.com/` differs from the observed document. |

The geometry records distinguish these controls from hidden, occluded or
out-of-viewport footer links. All three chosen controls have a matching original
loader identity, main-frame URL, native button tag and center-hit proof.
Observed timestamps are 8,107 ms, 12,277 ms and 19,450 ms respectively. These are
observation times, not first appearance times, and cannot establish availability
inside the separate 3,000 ms explicit-choice worker.

The later independent passive reviews are different visits and environments.
They did not reproduce the original first-layer buttons; Red Hat's review found
the combined footer link. That does not invalidate the original geometry or
prove current absence. No new visits were made for this investigation.

## What to focus on

1. **Verified TrustArc choice confirmation.** The retained GPC semantic probes
   were unavailable on all three and sale/sharing state remained unknown. Existing
   explicit opt-out confirmation reads only the supported GPP state. TrustArc
   provider recognition or its registry `standards` list does not establish a
   usable API in these sessions. Before adding an action recipe, establish a
   narrowly documented, source-bound confirmation mechanism for an explicit
   sale/sharing choice. A changed opaque cookie, generic confirmation message or
   dismissed banner alone is insufficient. This is a focused confirmation gap;
   broad GPP feature work is not required by these results.
2. **Separate direct choice from opening preferences.** Start with IBM's and Red
   Hat's explicitly labeled buttons. Require a unique native element, exact visible
   and accessible names, reviewed container/frame, safe form/target properties,
   and a proven submission behavior. Keep Battlelog's “Your Privacy Choices” as
   a potential entrance until a separate explicit submission and confirmation are
   established. Do not give `#truste-show-consent` provider-wide click semantics.
3. **Retain original route authority and prove timing.** All three captured
   documents differ from the original requested URL. None gains an executable
   redirect grant from this report. Any proposed recipe must join the original
   dispatch, exact reviewed route, per-hop ancestry, public-network/TLS guards,
   and live document binding. First prove it in deterministic fixtures, then in
   an eligible bounded diagnostic. Preserve the existing action reserve and
   follow-up; do not turn the late main-lane observations into a larger worker.

The original Accept/Reject packets do not close the confirmation gap. Battlelog
has unconfirmed Accept and Reject registration; IBM has unconfirmed Accept and
no joined Reject packet; Red Hat's Accept and Reject actions were not attempted.
No inference about explicit opt-out success or failure follows from those paths.

## Dispatch and audit interpretation

Offline replay with current bound-control eligibility skips all three originals;
none becomes a supported route or action. This is appropriate for execution.
The current eligibility function also returns `controlObserved: false` because
it excludes observations whose document differs from the exact requested target
before counting eligible local controls. That field must not substitute for the
canonical first-layer presence measure: these three original controls were
observed. A future funnel refinement should separate canonical observed presence
from action-eligible document/control binding, without broadening execution.
The retained audit's three presence records are corroborated; no historical
count rewrite or report modification is warranted by this review.

## Verification and cost

Artifacts and reproducible review:
`outputs/trustarc-opt-out-scope-2026-11-05/retained-review.json` and
`replay-retained.ts`. The acquisition receipt identifies 12 exact original
objects (1,167,009 bytes): bundle, manifest, geometry and shard summary for each
scan. Original S3 byte counts and SHA-256 values were checked against the
persisted result event and manifest; compressed bundles used the canonical
bounded decoder. All three report source generations match the frozen cohort.
The replay also rechecks hashes for the public export and generation-matched
control extracts, original document binding, visible control corroboration,
unknown state and fail-closed dispatch. It does not fabricate historical
submission packets or state transitions.

One bounded read-only AWS database task obtained exact original pointers.
Its waiter disconnected; the same successful task's checksum-verified output was
recovered, with no duplicate task. Original objects were read from S3 without
listing buckets. Cost is estimated below $0.05 one-time and $0 recurring change.
All new files are local investigation artifacts/documentation; no production
code, report, flag, scoring, worker or retention configuration changed.
