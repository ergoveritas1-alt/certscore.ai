# CertScore.ai explicit opt-out live verification

The owner authorized targeted verification on November 5, 2026. Five local
consent captures and two conditional opt-out attempts were completed across
Evernote, ColoCrossing and Identity Digital. These are targeted lane diagnostics;
local geographic egress was not independently verified. They do not establish
production performance, population coverage, or end-to-end live coordinator timing.

## Findings and local fixes

The initial three captures yielded no eligible route. Retained native-node
bindings and HTML excerpts showed the same concrete omission on Evernote and
Identity Digital: explicit opt-out-labelled OneTrust banner buttons use
`button#onetrust-pc-btn-handler`, not the footer recipe's class. Native ID binding
now joins the existing AX name/document proof. The action worker requires the
expected banner ancestor, reviewed accessible/visible names and all existing
geometry, target and form exclusions. It selects the banner path once; an unsafe
or generic Settings banner does not fall back to a footer click. Duplicate native
banner nodes still fail closed. Historical controls without the opt-in keep the
original behavior. This extends the unreleased local bound-controls recipe only.

ColoCrossing's same-document geometry packet and screenshot positively retained
a visible opt-out control, while its typed control inventory omitted it. The
existing geometry materializer filtered to Accept/Reject/Options. It now also
retains confirmed native opt-out buttons and anchors, excluding covered, hidden,
ambiguous and non-native container candidates. It does not change Accept/Reject
selection or actions. Exact-ID geometry can corroborate the matching AX binding;
distinct AX backend nodes remain distinct. No new browser read or model is added.
Retained-only prospective replay supports all three controls and rejects covered
variants. Original evidence remains unchanged.

## Post-fix live outcome

| Site | Eligible / dispatched | Submitted / confirmed | Retained stopping evidence |
| --- | --- | --- | --- |
| Evernote | Yes / yes | No / no | Exact HTTP 200 page; DOMContentLoaded; no registered recipe at the 517 ms usable-document checkpoint. |
| ColoCrossing | Yes / yes | No / no | Exact HTTP 200 page; navigation/readiness budget exhausted before a usable-document milestone. |

Both follow-ups independently captured the now-eligible control and dispatched
the existing bounded observer. Neither clicked, submitted or established opt-out
registration. This demonstrates repaired eligibility and dispatch, not successful
public-site opt-out. There were no automatic retries or identity/region changes.
Identity Digital was not revisited after the fix.

The next priority is readiness inside the existing action window: distinguish
DOMContentLoaded from the reviewed CMP control becoming available, and stop at
a cutoff that preserves the submission, confirmation and follow-up reserves.
Do not increase the time cap or replace missing readiness with a failure claim.
Evernote's one early checkpoint does not establish when its CMP became ready.
ColoCrossing's result does not identify the cause of its navigation delay.

A generation-matched retained 24-hour cohort had ten observed first-layer opt-out
controls: five OneTrust, three TrustArc, one consentmanager and one CookieYes.
This makes TrustArc the next provider to investigate after OneTrust readiness,
not a demonstrated executable recipe. Taboola alone does not justify prioritizing
consentmanager above TrustArc. No additional CMP action recipe was invented.

## Verification and boundaries

- Final coordinator, browser and geometry regressions: 197 passed.
- Earlier expanded browser suite: 55 passed; four focused existing geometry
  regressions and four contract/candidate tests also passed.
- Web, Lambda and validation-worker typechecks passed.
- Five source bundles and two action packets independently rehashed and checked
  against scan, target and dispatch identity. Three original geometry packets
  replayed prospectively without rewriting historical evidence.
- A broad integration invocation encountered missing unrelated saved snapshots
  and was stopped. The affected geometry tests passed in a focused invocation;
  the broad corpus is not claimed as passing.
- Contact-history export, canonical selection with the owner cooldown waiver,
  repository ledger update and idempotent central contact recording were used.
  The registry check passed. AWS waiter disconnects were recovered from the
  existing tasks' terminal status and logs; no duplicate task was launched.

Capture caps, worker sizes, Accept/Reject lanes, GPC, production flags and scores
are unchanged. No deployment, production scan/report write, model call, held-site
visit or external form occurred. Local changes enable $0 recurring spend. Metadata
remains within the previously disclosed sub-$1/month estimate; ledger task costs
are small one-off bookkeeping charges, conservatively below $0.05 total. Additional
conditional worker use remains in the owner's approved extra-lane scope.

Receipt: `outputs/opt-out-live-verification-2026-11-05/verification-receipt.json`.
Initial, follow-up, selection, ledger, test and source artifacts are retained in
that directory. Luna evaluation remains excluded.

The subsequent [bounded readiness implementation](opt-out-readiness-policy-2026-11-05.md)
separates DOMContentLoaded from reviewed-control readiness and preserves action
reserves. Local delayed-control fixtures pass; public checks remain limited by
readiness within the unchanged window, with no confirmed opt-out yet.
