# Evidence coverage improvements — local verification, October 14, 2026

Implemented locally on `codex/cmp-scanner-production`. No deployment or push.
Historical scan evidence and persisted assessments were not rewritten.

## Implementation

- Required consent-proof visits can retain a distinct `certscore.cmp-basic-evidence.v1`
  packet: visible first-layer category/service controls, loaded Borlabs/OneTrust
  declarations, explicit service identities and hit-tested CMP privacy links.
  This passive capture starts once, only after controls appear on an already-required
  observation. It has a 350 ms opportunistic slice inside the existing lane deadline,
  no join wait, action, new navigation, retry or late publication. CMP links take
  priority over unrelated page links. Loader drift discards its observations;
  bounded timing diagnostics distinguish unavailable scopes, slice exhaustion and
  capture failure. The coordinator accepts it only from consent-proof.
- WC01 independently assesses those basic facts through the typed CMP assessment,
  persisted consent projection, normalized concern and existing policy/checklist
  path. They can fill unresolved criteria without overwriting deeper assessments.
  A partial list cannot establish missing CMP declarations or feature absence.
- A single existing axe run can preserve stable main-document **positive** findings
  when child frames change. Only an explicit set of node-local rules is eligible;
  child nodes, frame-dependent rules, frame containers and unbound examples are
  excluded. Main navigation invalidates the audit. Retain original engine breadth,
  excluded-node counts, changed-frame coverage and the existing example budget.
  The report/API/SDK/MCP identify this as limited main-page coverage; it never
  produces a clean/negative whole-page conclusion.
- Combined privacy/cookie notices are classified with their privacy facet before
  the existing extraction/analysis, then retain both facets from the same document.
  This adds no retrieval, model call or child/index-selection work. Complete,
  strong, hash-bound sections receive topic-scoped v2 coverage despite unrelated
  section truncation. Whole-document absence gates remain unchanged. The canonical
  ownership registry now includes the date-bound Ars Technica–Condé Nast relationship.
- Versioned named-CMP recipes use documented Osano saved-consent events, HubSpot
  complete-category callbacks, and Drupal EU Cookie Compliance configured status/
  category APIs with matching state writes. Require fresh action-bound proof;
  opaque receipts, legacy booleans, partial/unknown category maps and stale events
  remain unconfirmed. Osano's IAB storage/opt-out fields remain separate scopes.
  TCF-enabled Osano remains unconfirmed without separate IAB purpose proof.
  The bounded registry accommodates one additional Drupal entry (25 → 26); search
  deadlines, one-action limits and browser counts are unchanged.

Primary provider references:
[Osano API](https://developers.osano.com/cmp/javascript-api/developer-documentation-consent-javascript-api),
[HubSpot consent API](https://developers.hubspot.com/docs/api-reference/latest/account/settings/consent-banner/consent-banner-api),
[Drupal official 8.x-1.24 source](https://ftp.drupal.org/files/projects/eu_cookie_compliance-8.x-1.24.tar.gz),
[Condé Nast Ars Technica brand](https://commercial.condenast.com/brands/ars-technica).

## Verification

Retained replay verified original producer SHA-256 metadata for 26 bundles across
10 earlier domains. All replay outputs are diagnostic-only; original bytes and
historical reports are unchanged. Missing historical node/API proof was not invented.
Passing focused suites: 27 core capture/semantic/coverage checks; 13 preference
checks; 18 action/recipe checks; 52 WC01 report/persistence checks; 5 accessibility
contract checks; 7 lane/safety checks; 29 shared-registry checks; and 4 combined/topic
policy checks. Core, web and Lambda typechecks and API-contract build passed.
Focused checks cover stale/foreign documents, ambiguous vendors, partial inventories,
malformed events, delayed CMP bootstrap, iframe/main-navigation changes, canonical
persistence/concerns, shared exports and absence/completeness boundaries.

Three explicitly approved fresh local admissions ran serially after a clean server
restart, through the normal six-lane scan/report flow:

| Target | Local scan | Verified results |
| --- | --- | --- |
| IKEA | `3da7c991-da4f-406b-9b3a-ed551490298a` | 16.5 s coordinator runtime. CMP: 8 Observed, 2 Not assessed, 3 Partially assessed; valid prominence, category and privacy-access evidence, 12 declared cookie patterns. Combined notice retains 9 positive section candidates; 7 substantive report topics are Observed. One WCAG issue and two manual-review rules retained. |
| Ars Technica | `ba23b31d-6f23-4c49-9462-63e691e3f997` | 25.1 s runtime. Eight substantive policy topics Observed through verified publisher ownership. Despite 12 changed child frames, one main-page WCAG issue (19 element failures) and one review rule remain; four excluded child/frame-dependent node failures are accounted for. |
| HubSpot | `3c50e59e-5fad-4598-ba9a-b725349b9906` | 19.4 s runtime. Banner, Reject and prominence Observed. Four WCAG issue rules and one review rule retained. Deeper panel binding remains unavailable and Reject semantic registration unconfirmed; these were not promoted. |

All three original producer bundles verified against terminal hashes. Nine evidence
section checks (CMP, policy, accessibility × 3 reports) matched API export, SDK
reconstruction and in-memory MCP pagination, including Ars's main-document scope.
The local IKEA report was opened with CMP and policy boxes expanded.

The live pass exposed two further timing edges: a first empty observation could
consume the one passive-basic capture attempt, and HubSpot's documented listener
queue could be absent before bootstrap. Both were fixed afterward and verified with
loopback/delayed-bootstrap tests, without another public contact. **Those follow-up
repairs have local-test coverage, not fresh public-scan confirmation.** Final boundary
checks also reject out-of-window/stale basic packets and keep GDPR topics solely
on the privacy facet of a combined document. Basic packets
were not retained in the three public captures above; do not claim otherwise.

## Remaining honest limits

- IKEA does not retain explicit individual-service identities through this OneTrust
  getter; cookie names or hosts are not substituted for service names. Its client
  consent decisions remain unconfirmed. Bare numeric lifespans have no verified
  unit and are not rewritten as days.
- HubSpot's saved panel identity and full semantic decision remain insufficient in
  this live capture. No guessed panel selector, extra click or weaker proof was added.
- Ars's unresolved first-layer/Options inspection remains limited. The independent
  policy and main-document WCAG gains do not imply complete CMP coverage.
- AT&T retrieval failures, FullStory chat obstruction/hidden preferences, Weather's
  genuinely incomplete topic sections, and indeterminate paired GPC response remain
  limits. No unbounded retry, extra browser lane or forced positive was introduced.
- The sample verifies these repairs, not an internet-wide precision/latency claim.

## Operational and cost boundaries

Successful central all-channel ledger export, canonical target selection and held/
no-go exclusions preceded live work. The owner explicitly approved three local
admission exceptions after usage reached 29. The original 20/day source limit was
restored immediately after every submission; its SHA-256 remains
`bd443b8bbbeec2f30cd5f1963231394a615843b3c6049771c7bb96ddc62afb68`.
Three contacts were persisted under the idempotent operational key
`owner-coverage-improvements-20261014-targeted`; the manual ledger candidate was
reviewed and records only the three intended domains. SITS, Patagonia and Drupal.org
were not contacted.

No additional lane, model-call policy, retry, deadline, retention period, reserved
capacity or infrastructure service. Expected incremental bounded metadata/storage
and semantic-decoding cost is below $0.50/month at 100,000 scans, within the existing
approved envelope. Estimated one-time three-scan spend is below $0.30; including
operational ledger one-offs, below $0.50. These are estimates, not measured AWS bills.

Ignored receipts/logs/replay artifacts: `artifacts/coverage-improvements-20261014/`.
