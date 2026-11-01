# CertScore.ai passive form-trace integrity — October 31, 2026

Owner-authorized local implementation only; no deployment, public target visit,
production scan, form submission, privacy action, cloud task/query or historical rewrite.
The existing main-document scope, windows, workers and acquisition budgets stay.

The runtime producer sends only main-frame requests with an available current
native loader token to the passive form tracer. Child-frame requests and child
navigations remain in ordinary network evidence without borrowing the main
document's token or consuming its form-trace inventory. The existing request to
preceding-event token join excludes stale-document requests. This change does
not add native execution-context proof to delayed renderer event delivery.
The verified consumer's endpoint, frame, document and response checks remain.

The tracer enforces its existing 32,768-byte body ceiling with UTF-8 bytes before
payload parsing. Oversize bodies are discarded and the existing truncation flag
is retained; complete independently supported query evidence remains usable.
Missing/throwing reads remain unsupported/unavailable, separate from successful
empty/absent reads. Query, flat-JSON and URL-encoded candidates share a maximum
of 100 inspected fields per request. Non-string JSON values consume inspection
slots too; omissions set truncation, while exactly 100 candidates alone do not.
The 100-request, ten-event and 30-field/event caps remain. Unsupported payload
formats and the matching rules are unchanged; no raw values or bodies are added
to retained output.

An over-limit URL keeps only its safe endpoint and the existing truncation
outcome. Cropping a query mid-value could previously create an apparent exact
match to a different value; partial query strings are never matched. This does
not expand the URL budget or create endpoint/request proof from absent data.

Accessibility overlap can be verified only by the existing opaque native
image/link identities in the same complete audit. Selector-only evidence stays
unresolved, including unchanged, redacted and historical unknown-precision
selectors. Finding eligibility, current weights and conservative unresolved
overlap treatment remain unchanged. No report deduction explanation or scoring
policy expansion is added. Earlier materializations remain historical.

Regressions exercise UTF-8 and exact byte boundaries, shared candidate limits,
omission accounting, URL cutoff ambiguity, unavailable versus absent input,
independent query proof, stale document tokens, native identity and unchanged
canonical scoring. The loopback fixture emits one synthetic input event without
filling, clicking or submitting a form, then records independent local requests
from the main and two successive child documents. No public target is contacted.
These checks are included in the permanent retained-fix regression gate.

Retained review and the original counterexamples are sealed separately under
`artifacts/daily-scan-audit/runs/20261031T205533Z-manual-next-priorities-7ac79679`.
Historical defect incidence and production improvement remain unknown. Twelve
reviewed originals have native identities on all 85 relevant examples; the
synthetic selector counterexample does not establish an error in those records.

Local paid usage is $0. The conservative processing increment is below
$0.10/month at 100,000 scans within existing budgets; frame filtering reduces
work. No additional browser/body/header/SDK/model read, wait, worker, service,
capacity, retention or capture allowance is introduced. Dashboard contracts,
tool pins, source series, latest output and scheduled invocation accounting stay.
