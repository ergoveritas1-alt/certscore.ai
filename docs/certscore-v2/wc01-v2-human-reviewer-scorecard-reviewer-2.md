# WC01 v2 Human Reviewer Scorecard - Reviewer 2

Internal reviewer trial only. Not customer-facing report output.

## Instructions

Review the Markdown summary first. Open JSON only when the Markdown top-N view is not enough to score the artifact.

Ratings use `1` to `5`, where:

- `1` means unclear or unusable
- `3` means partially usable but reviewer friction remains
- `5` means clear and usable

Use `N/A` only for sensitive-context clarity when the artifact has no sensitive-context items.

Allowed reviewer actions:

- `evidence_shape_confirmed`
- `needs_more_evidence`
- `internal_only`
- `policy_copy_review_required`
- `sensitive_context_escalated`
- `rejected_overbroad`

## Artifact Paths

| Site | Markdown summary path | JSON path |
|---|---|---|
| `weather.com` | `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry/weather.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry/weather.com/Wc01V2EvidencePreviewPacket.json` |
| `segment.com` | `artifacts/v2-wc01-evidence-preview-edge-consent/segment.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-edge-consent/segment.com/Wc01V2EvidencePreviewPacket.json` |
| `plannedparenthood.org` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/plannedparenthood.org/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/plannedparenthood.org/Wc01V2EvidencePreviewPacket.json` |
| `greenhouse.com` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/greenhouse.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/greenhouse.com/Wc01V2EvidencePreviewPacket.json` |
| `hotjar.com` | `artifacts/v2-wc01-evidence-preview-edge-consent/hotjar.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-edge-consent/hotjar.com/Wc01V2EvidencePreviewPacket.json` |
| `healthline.com` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/healthline.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/healthline.com/Wc01V2EvidencePreviewPacket.json` |
| `bankofamerica.com` | `artifacts/v2-wc01-evidence-preview-stress-fresh-registry/bankofamerica.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-stress-fresh-registry/bankofamerica.com/Wc01V2EvidencePreviewPacket.json` |
| `benefits.gov` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/benefits.gov/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/benefits.gov/Wc01V2EvidencePreviewPacket.json` |
| `target.com` | `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry/target.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-expanded-fresh-registry/target.com/Wc01V2EvidencePreviewPacket.json` |
| `cloudflare.com` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/cloudflare.com/Wc01V2EvidencePreviewPacket.summary.md` | `artifacts/v2-wc01-evidence-preview-policy-stress-consent/cloudflare.com/Wc01V2EvidencePreviewPacket.json` |

## Blank Scorecard

| Artifact | Queue lane clarity 1-5 | Sensitive-context clarity 1-5/N/A | Evidence grouping clarity 1-5 | Top-N excerpt usefulness 1-5 | Unresolved-ref summary clarity 1-5 | Redaction-warning clarity 1-5 | Confidence/directness usefulness 1-5 | Family context usefulness 1-5 | Can make queue triage decision? yes/no | Can make evidence-shape decision? yes/no | Can make first-pass full evidence decision? yes/no | Needed JSON inspection? yes/no | Needed upstream artifact inspection? yes/no | Selected reviewer action | Freeform notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|---|
| `weather.com` | 5 | N/A | 4 | 3 | 5 | 4 | 4 | 4 | yes | yes | no | yes | yes | `needs_more_evidence` | Markdown makes queue lane and evidence shape understandable, but 108 groups and 8,207 unresolved refs make top-N insufficient for first-pass full evidence adjudication. JSON confirmed high confidence/directness, but upstream inspection would still be needed for exhaustive review. |
| `segment.com` | 5 | N/A | 5 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `evidence_shape_confirmed` | Markdown clearly shows all three families and separates unresolved refs from displayed redacted source refs. JSON was useful to confirm high confidence/directness, but upstream inspection was not needed for first-pass review. |
| `plannedparenthood.org` | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `sensitive_context_escalated` | Reproductive-health routing is clear. Top-N groups show tracking, cookie/storage, and Hotjar behavioral analytics shape well enough for first-pass internal review. JSON confirmed confidence/directness. |
| `greenhouse.com` | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 4 | yes | yes | yes | yes | no | `sensitive_context_escalated` | Employment / HR routing is clear. Unresolved volume creates reviewer friction, but the grouped preview is still enough for first-pass evidence-shape and first-pass full evidence review. JSON was needed for confidence/directness. |
| `hotjar.com` | 5 | 5 | 4 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `sensitive_context_escalated` | Behavioral analytics reference routing is clear. Session replay / behavioral analytics groups are understandable, though unresolved refs are high. JSON confirmed confidence/directness and upstream inspection was not needed for first-pass review. |
| `healthline.com` | 5 | 5 | 5 | 4 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `sensitive_context_escalated` | Health context is clear. Markdown top-N groups are representative enough across tracking, cookie/storage, and behavioral analytics. JSON confirmed confidence/directness. |
| `bankofamerica.com` | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `sensitive_context_escalated` | Compact finance packet. Markdown is enough for first-pass review; JSON was only needed to confirm confidence/directness. |
| `benefits.gov` | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `sensitive_context_escalated` | Compact public-benefits packet. Grouping, warnings, and sensitive routing are clear. JSON confirmed confidence/directness. |
| `target.com` | 5 | N/A | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `evidence_shape_confirmed` | Standard-lane packet with all three families. Markdown shows tracking, cookie/storage, and FullStory behavioral analytics shape clearly. JSON confirmed confidence/directness. |
| `cloudflare.com` | 5 | N/A | 5 | 5 | 5 | 5 | 4 | 5 | yes | yes | yes | yes | no | `evidence_shape_confirmed` | Compact standard-lane packet. Evidence groups and warning categories are clear; diagnostic tag-management context remains separated. JSON confirmed confidence/directness. |

## Notes Prompts

Use these prompts in the freeform notes when helpful:

- What was confusing?
- Were warnings too noisy?
- Did unresolved refs block review?
- Were top-N groups representative enough?
- Were sensitive-context labels sufficient?
- Did you need JSON, and why?
- Did you need upstream artifact inspection, and why?
- Should any artifact remain internal-only?
- What would you need before supporting any future production proposal?
