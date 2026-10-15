# Axeptio initial Close and preference-cookie classification

Policy requested by the owner on October 14, 2026. The base policy was deployed
on October 15. This document also describes the scoped category-capture corrections.

## Evidence and scope

The independent fresh Ireland visit retained an Axeptio first layer with Google
Analytics 4 and HubSpot switches initially off. Clicking the exact Close control
completed the consent record with both vendors false and emitted denied Google
consent-state updates. No new GA or HubSpot request was observed in the following
20.067 seconds. Three CMP requests remained, including two event-endpoint requests;
their bodies were not assessed. This does not establish zero network activity or
universal essentiality of CMP telemetry.

Independent evidence is separate from the original October 12 scan:

- Original report: `4ae8cca1-0b70-46b6-9ece-8f5d1dc8fb53`, score 62.
- Independent visit: `outputs/mistral-close-review-2026-10-14/`, completed
  `2026-10-15T03:52:35.697Z`, AWS `eu-west-1`, verified country IE.
- Local reassessment: `outputs/mistral-close-fix-local-2026-10-14/`.

These output paths are relative to the owner's primary WC01 checkout. The original
report and retained evidence are not rewritten or persisted as a new scan.

## Passive control recipe

The shared CMP registry owns `axeptio.initial_optional_off_close.v1`. It requires
one exact `#axeptio_btn_close[aria-label="Close cookie settings"]` button in an
open shadow root with the registered widget, Accept and Next controls. Category
inspection is bound to the unique registered `[data-testid="widget-container"]`
initial panel containing Close, Accept and Next, rather than the entire shadow
root. The separate floating widget's checkbox is outside this category inventory.
Every
retained category input must be a unique, enabled, unchecked checkbox associated
with a visible labelled category. The auxiliary
`#axeptio_consent_checkbox` is excluded by exact identity. Within the registered
panel, the non-interactive `input[type="hidden"]` field whose name starts with
`axeptio_cookies_` and ends with `_value` is consent-record metadata, not a user
choice. The registry excludes that exact field pattern without reading its value.
Checkboxes with the same name, unrelated hidden fields and unexpected inputs,
hidden categories, incomplete or duplicate controls, checked switches and
unbound/stale evidence fail closed. Custom checkbox paint does not invalidate a
visible wrapping label. Generic Close buttons do not qualify.

The producer retains the initial category proof in geometry. WC01 verifies that
proof before the assessment and existing persistence, concern-policy, checklist
and scoring paths consume it. Simple bundle control rows cannot carry this proof
and must not turn it into an unqualified Reject observation.

This is an observation recipe, not an action recipe. It performs no Close click,
adds no action authorization, and does not claim semantic refusal registration.
This observation does not authorize an automatic Close click. The independent
Close visit is not imported as a production After Reject artifact.

An incomplete initial category inspection retains the existing selection-submit
role with unresolved Reject intent. It cannot supply a verified missing-Reject
finding. Complete checked or disabled optional categories still cannot qualify
as a necessary-only equivalent. Historical captures retain their original proof.

The October 15 production follow-up `c270d0de-ede0-480c-85d5-65a2a55680ee`
retained three visible initial-panel switches, four candidate category inputs and
an incomplete Close selection proof. An independent passive Ireland visit
identified the extra candidate as the hidden consent-record metadata field.
Its 70-point report remains intact. The panel
scope correction is a producer fix to this same observation recipe, not a new
scoring weight, action recipe, lane, capture window or report repair.

## Exact preference-cookie policy

New runtime captures use `axeptio_consent_preferences.v1` for these exact names:

| Cookie | Documented purpose |
| --- | --- |
| `axeptio_cookies` | Consent record and metadata |
| `axeptio_all_vendors` | Declared widget vendor list, not accepted vendors |
| `axeptio_authorized_vendors` | Selected vendor preferences |

They are consent-management preference storage with technical essentiality under
this classification policy. The retained classification reason includes the policy
version. Journey construction preserves the exact classification, and WC01 uses
the marker to interpret new producer evidence. Default legacy knowledge and stored
reports keep their original classifications. Similar names, unrelated unknown
cookies and actual Analytics cookies receive no exemption. Security classification
of `__cf_bm` already existed and is unchanged.

This cookie-purpose policy is not a legal determination or an exemption for all
Axeptio requests. The source is [Axeptio's cookie documentation](https://support.axeptio.eu/en/articles/274085-does-axeptio-place-cookies),
checked against the independently retained names and semantic state.

## Local scoring reassessment

The local reassessment is **82**, using the original deduction ledger and the later
independent privacy evidence. It is not a new scored scan or a replacement report.

| Deduction | Original | Local reassessment |
| --- | ---: | ---: |
| Refusal path | 12 | 0 |
| Unknown-purpose pre-consent storage | 8 | 0 |
| Pre-choice Google Analytics request | 8 | 8 |
| Accessibility | 10 | 10 |
| Total | 38 | 18 |

The canonical GDPR/ePrivacy calculator verifies the retained privacy deductions.
Accessibility deductions are carried forward from the historical report, not
retested by the independent privacy visit. No weights or general consent-mode
scoring policy change. Disclosure and denied storage remain context rather than
a blanket exemption for the pre-choice measurement request. No article or
leaderboard score is silently changed while its linked historical report says 62.

## Cost and checks

No lane, invocation, retry, wait, screenshot, model call, object write or retention
extension is added. Bounded reads and policy/category metadata use the existing
capture. Incremental metadata/compute cost is estimated below $0.10/month at
100,000 scans, within the repository's pre-approved threshold. Local checks use
fixtures and retained evidence and add no AWS spend.

Focused coverage includes exact recipe positives and negatives, altered category
proof, stale document identity, passive action capability, producer cookie capture,
journey preservation, legacy parity, canonical storage concern and scoring, and
unchanged OpenAI historical replay. See the local verification record for counts
and the unrelated policy-bridge test failure reproduced from unchanged HEAD source.
