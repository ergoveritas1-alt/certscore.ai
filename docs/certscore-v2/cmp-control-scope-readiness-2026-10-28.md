# CertScore.ai shared control-scope readiness

The owner authorized a retained review and live checks across Vinted, AkzoNobel
and University of Silesia, with shared fixes and no deployment. Cooldown remains
waived; contact holds, exact-target authorization, no-go stops, crawler identity
and existing search/result/observation limits remain unchanged.

## Reproduced shared defect and repair

Playwright visibility and viewport hit testing can both pass for a button whose
ancestor has zero opacity. Named Accept/Reject search returned that candidate
before its consent surface was interactive. The later scope proof then exhausted
its separate one-second opacity allowance and abandoned a control that could
become valid within the original search deadline.

Two controlled browser fixtures failed against the unchanged prior compiled
candidate and passed after the repair. A 1.5-second fade demonstrates the missed
transition in both Accept and Reject. Negative fixtures cover permanent
transparency, changed labels, duplicate controls, inert and aria-hidden ancestry;
an open-shadow fixture verifies composed ancestry without changing ordinary
hit-target facts. All 13 new tests pass.

Both named native-control resolvers now use one shared readiness read. It checks
composed ancestry inside the existing hit-target evaluation, adding no browser
round trip or wait allowance. A noninteractive scope stays pending in ordinary
search and is diagnosed as control_hidden. Final source/label/uniqueness,
actionability, target, baseline and dispatch proof remain unchanged. No hidden,
inert or ambiguous control becomes eligible. Closed-shadow/accessibility recipes
retain their existing independent checks. Historical packet/contracts do not
change and consent registration is not inferred from a completed click.

## Selected live evidence

| Case | Final candidate result | Interpretation |
| --- | --- | --- |
| AkzoNobel Accept | Click and observation completed; consent confirmed. | The resolver retained control_hidden before later finding an interactive control. This visit exercised the repaired path. |
| University of Silesia Reject | Click and observation completed; consent unconfirmed. | Control resolution succeeded in this visit. Prior visits vary; this is not proof that the shared repair caused the recovery. Complianz complete-category/receipt verification remains separate. |
| Vinted Accept | No control resolved. | Same-visit served OneTrust configuration sets NoBanner=true, consistent with the missing first-layer control in this local test context. Not proof of whole-page absence, selected runtime configuration, or a globally absent banner. |

A wider retained configuration review verified 27 candidate contacts with saved
configuration bodies. Six action rows contain NoBanner or Reject-button
suppression context. One of those nevertheless completed a Reject click. These
flags therefore remain context, never a reason to skip search, reclassify a scan,
exclude a failed action from statistics, or open a preference center.

Three initial diagnostic contacts are retained separately. A diagnostic-only
locator wrapper returned undefined for two scope checks because a serialized
function string was not invoked. AkzoNobel and University of Silesia action
outcomes from that cohort are excluded from improvement comparisons. The final
three visits used passive return-value logging with no callback replacement.
All contacts remain in the operational ledgers; no result was erased or retried
to manufacture a passing denominator. Vinted's diagnostic had no affected scope
read. The ordinary prior retained failures remain intact.

## Verification, costs and boundaries

The final candidate source is bound to an isolated compiled build. The release
consent gate includes the new fixture; full check results, historical replay and
live packet/projection/hash verification are retained in the run directory.
These are selected local browser checks, not production-region or population
reliability verification. No release readiness or production closure is claimed.

Six local contacts have a conservative $0.60 one-time allowance. Expected added
readiness compute is below $0.50/month at 100,000 scans: the observed one-in-76
action exposure and approximately three seconds of additional useful search
correspond to roughly $0.40 at two action opportunities per scan and a 3 GB
worker. This is a sample-based estimate, not an incidence guarantee. No worker,
absolute budget, model call or retention change is introduced. Existing approval
for bounded after-action capture continues to cover newly completed paths.

Contact metadata is persisted using the repository AWS ledger workflow and
committed locally. Product changes remain local and uncommitted. No deployment,
push, flag change, historical report rewrite, dashboard update or modification to
the daily audit checkpoint/backlog/model-transition ledger occurred.

Run: `/Users/benmasek/WC01/artifacts/daily-scan-audit/runs/20261028T202106Z-manual-cmp-control-resolution-batch`.
