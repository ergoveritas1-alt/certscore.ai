# Retained CMP cookie comparison details

Local implementation approved October 14, 2026. No new capture, rescan or deployment is authorized by this change.

`cmp_inventory_tables.v7` / `cookie_name_comparison_details.v3` supplements assessment v6 and report v3 with optional evidence fields. Historical assessments remain unchanged on read.

- Partial declaration comparisons may include cookie names from an existing, validated completed Accept-click snapshot. This is factual capture, not semantic consent confirmation. Complete-inventory Review eligibility, action confirmation and scoring remain unchanged.
- `possibleTemplateMatch` uses the canonical `ga4_placeholder.v1` policy: a retained literal `_ga_xxxxxxxxxx` and a corresponding ten-character uppercase/digit GA4 suffix. This is a possible template only. `matchedPattern` remains null; no verified-match tick is shown. Exact names and explicit glob matches take precedence.
- `unmatchedNameCount` continues to count names without a **verified** match. Optional `possibleTemplateNameCount` identifies a subset of that count. The report distinguishes verified matches, possible templates and names without either.
- Unnamed or over-160-character after-click cookie entries remain in the original source packet. They are counted in optional `omittedAfterAcceptCookieCount`, explicitly excluded from the bounded name comparison, and never given invented names.
- Optional `observedExpiry` retains capture time, expiry time and their exact difference. It requires a completed source-bound snapshot and a unique exact cookie name with retained identity/value hashes. Multiple identities, invalid arithmetic, session expiry without a timestamp, failed or mismatched capture remain unavailable. A declaration receives expiry metadata only for an exact observed name; templates never borrow it.
- CMP-stated purpose and retention remain literal captured disclosures. Registry-inferred purpose and observed time remaining stay separate. Extra expiry metadata cannot turn incomplete CMP disclosure into a complete assessment.
- Shared reportability removes after-Accept details when Accept is not Observed. The internal assessment and producer evidence remain retained. Reports, API, SDK and MCP consume the same policy-projected evidence.

The existing bounded snapshots and 100-row table limits are unchanged. No lane, browser interaction, wait, retry, model call, storage-retention extension or infrastructure capacity is added. UI tables retain the eight-row scroll window, copy action, neutral template label and readable horizontal scrolling on narrow screens.

Verification: retained IKEA report `3e99f256-8aae-4abd-a2fb-03060ba64447`, original producer/auxiliary hashes verified, local canonical rematerialization backed up before persistence. Expected comparison: eight names, six verified matches, one possible template and one unmatched name; both CMP checks remain Partially assessed. Score, controls, prominence, policy and accessibility assessments must remain unchanged.

Local verification completed: 123 focused tests passed, web TypeScript check and contracts/API/SDK builds passed, generated public schemas were current, and saved CMP/accessibility/policy sections passed API/SDK/MCP reconstruction parity. The local report retains 11 Observed and two Partially assessed criteria, score 92. No external requests, model calls or scans were needed for replay/export verification. Recurring production cost change in this task: $0 (local only, no deployment or infrastructure change).
