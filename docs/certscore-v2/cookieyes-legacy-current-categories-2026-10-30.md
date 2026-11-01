# CertScore.ai legacy CookieYes current-category confirmation

Owner scope: local current-category proof, documented fixtures and focused offline
tests. Keep existing capture budgets; no new scans, consent actions or deployment.

The retained official WordPress Cookie Law Info 2.1.2
[writer source](https://plugins.svn.wordpress.org/cookie-law-info/tags/2.1.2/public/js/cookie-law-info-public.js)
is 34,179 bytes, SHA-256
`6c52384c7b0641dd1ead85d079c22d39bcc6dc5f2537afb1e6396bb619771a3f`.
Lines 796–824 operate on current preference checkboxes and `Cli_Data.strictlyEnabled`;
lines 863–888 merge an earlier base64 JSON receipt, replace the fields belonging to
current checkboxes, and write the configured consent version. The cookie setter
at lines 5–40 writes the value directly. The receipt can preserve retired fields
and `ccpaOptout`. Neither those fields nor `viewed_cookie_policy` establish the
current optional cookie choice. `CLI.allowedCategories` contains selected
categories; it is not the complete configured universe. Cookie identity lists
such as `nn_cookie_ids` do not supply that universe either.

`cookieyes_legacy_current_categories.v1` adds a narrow proof to the existing named
CookieYes changed-receipt confirmation path for Accept and Reject. It adds no
control selector, action recipe, action permission or fallback for unrelated
generic controls. Existing registered live-control ancestry resolution selects
the provider. Before dispatch, the selected control must additionally descend
from the single `#cookie-law-info-bar`. There must be one already-loaded
`#cliSettingsPopup`, containing every current `.cli-user-preference-checkbox`.
Reading hidden, already-loaded checkbox attributes does not open that panel or
establish its visibility, interaction state or public first-layer controls.

The proof requires the default aggregate/flag names, an own loaded `CLI` writer
function (never invoked), own `Cli_Data.consentVersion`, and a complete distinct
required-category array from `strictlyEnabled`. At most seven current checkbox
identities are supported: necessary, functional, analytics, performance,
advertisement, other and non-necessary. Necessary must be required, required
categories must belong to the current set, and at least one optional category
must exist. Unknown categories, mirrors/duplicates, missing/foreign checkboxes,
accessor configuration, TCF coexistence and custom cookie names remain unsupported.
This is a current loaded checkbox universe, not an inventory of all services,
processing purposes or disclosures.

Modern CookieYes receipts retain their existing path and skip the added renderer
baseline read. Otherwise the existing cookie baseline read is shared with one
passive, 25 ms capped control/configuration evaluation. Late results are ignored.
The post-click category read shares the existing instrumented-write snapshot;
it adds no SDK call, cookie read, poll or wait. Baseline and current category,
required-category and version values must match in the same document. The outer
source, target, loader, cancellation, click and absolute deadline guards remain.
Even after the existing control re-resolution, all work consumes existing budgets.

Confirmation also requires a changed exact receipt, a fresh instrumented setter
assignment from the action document, matching cookie name/domain/path/partition
identity, and unique current browser readback of the identical bytes. Conflicting
modern/legacy receipts, stale/reversed writes, identity changes and readback
mismatches remain unverified. The bounded decoder accepts at most 2,048 base64
characters and 24 flat JSON members; malformed/noncanonical base64, duplicate
keys including escaped aliases, nested values and prototype keys are rejected.
Every current category must have an explicit boolean value; required values must
be true and the receipt version must match the configuration exactly. Retired
fields never expand the universe. Optional values determine granted, denied or
mixed; mixed never confirms a uniform action.

The write sequence must advance beyond the captured pre-dispatch instrumentation
sequence as well as meeting the action timestamp. Equal-millisecond earlier
writes cannot acquire freshness from clock resolution alone.

Typed `cookieYesLegacyReceiptEvidence` retains the versioned protocol reference,
current category decisions, configuration, hashes and original timestamps. The
source hash identifies the reviewed interpretation, not a capture of the loaded
script's bytes. Raw receipt values and retired fields are not persisted in this
proof. The shared decision schema enforces proof exclusivity and matching
decision/state hash. Packet validation binds the control/provider/document,
pre-dispatch configuration, action, write and read clock. Report projection
preserves the verified packet/control/document binding. Initial registration,
terminal verification, completed action and capture coverage remain distinct;
no score or policy finding is introduced by this decoder.

Portable fixtures include the exact hashed writer excerpt, seven documented
configuration/receipt cases and negative controls. The excerpt runs only in a
Node VM with in-memory jQuery/cookie doubles; no browser or consent action runs.
Additional VM checks execute the actual serialized snapshot callback without
transpiler globals, verify no SDK/getter calls, and preserve Complianz reads.
Focused checks exercise receipt freshness/identity, missing and changing category
proof, modern coexistence, strict packet/projection binding and terminal timing.

The historical AB receipt is still unavailable as raw values/current category
proof. Its earlier unconfirmed result is unchanged. Synthetic fixture coverage
does not demonstrate production improvement; the October 29 190-report baseline,
102 unknown Reject observations and separate October 30 partial day are unchanged.
Production after-rates/deltas remain unavailable. No historical reports or
dashboard pins are rewritten, and no production-audit checkpoint advances.

Local paid cost is $0. Expected incremental bounded compute/proof cost is below
$0.20/month at 100,000 scans, with a conservative estimate below $0.85/month.
Four possible 25 ms baseline attempts across both action lanes consume at most
100 ms of existing deadlines (about $0.50 at 3 GB/100,000 scans); bounded processing
and proof metadata share unchanged retention. No new capture, memory, worker,
capacity, scan or paid retention allowance is added. Existing known cloud-month
estimate $1.32 / conservative forecast $2.21 within $5 is unchanged. Deployment
and any production adoption remain separate owner decisions.
