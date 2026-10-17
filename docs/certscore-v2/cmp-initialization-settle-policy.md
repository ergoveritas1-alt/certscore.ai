# Conditional passive CMP initialization settling

Release authorization, October 17, 2026: the owner requested preparation and
deployment once ready. Earlier local-only/hold statements below describe prior
verification stages. Release remains subject to canonical AWS readiness checks;
existing observation, scoring and approved cost bounds are unchanged.

Local implementation, October 17, 2026. Production deployment remains unauthorized.

## Approval and bounds

The owner approved a $25/month incremental ceiling at 100,000 scans for up to
four seconds of conditional CMP initialization settling inside the existing
24-second consent window. The implementation uses a stricter **2,500 ms** cap
to account conservatively for both the consent worker and waiting coordinator.
At the repository planning rate of $0.0000166667/GB-second and 3,008 MB for each,
100,000 full-cap waits cost approximately $24.48 before overlap. At 5–15%
incidence, the corresponding estimate is $1.22–$3.67/month. Existing bounded
diagnostics add less than $0.02/month. These are planning estimates, not measured
AWS billing. The operational cap must not be raised without checking the total
against the approved ceiling.

## Capture policy

`cmp_initialization_settle.v1` observes existing consent-proof request events.
It does not start a fetch, browser run, model call, action, retry or later report.
Only canonical registered main-frame GET initialization requests are eligible.
The initial registry recipe covers exact OneTrust HTTPS origins and bounded
loader, configuration and geolocation paths; telemetry contacts are excluded.

Requests are tracked by exact request identity and current document URL/loader.
The bounded map holds at most 128 requests. The existing strong-CMP/no-controls
gate may wait once when initialization remains pending or completed within the
last 250 ms. A 250 ms quiet interval allows already-started initialization chains
to finish, without extending the 2,500 ms allowance or the navigation-relative
24-second gate. Parent cancellation, document change, closure, overflow and the
existing lane deadline terminate the wait neutrally. New activity cannot renew
the maximum wait. The single passive configuration read retains its existing
350 ms slice and must still verify its own evidence and document binding.

Loader stubs and inactive DOM markers no longer consume that read prematurely.
Visible controls or registered API roots can permit earlier capture. Exact
registered public configuration methods may be inherited data methods within
four prototype levels; getters and Object/Function prototype fallbacks are
excluded. This does not invoke arbitrary SDK methods or loosen evidence proof.

Operational “settled” means the tracked requests reached a terminal state and
the short quiet interval completed. It does not establish SDK readiness, consent
registration, exhaustive inventory or compliance. Missing evidence stays limited.
Options/Customize remains disabled. Baseline and GPC observation are unchanged.

## Retention and projection

Within the existing event and byte caps, retain already-observed canonical CMP
requests and their exact matching responses above routine referenced traffic.
Main-document and qualifying collection/window proof keep higher priority.
Retention creates no CMP observation, finding or score effect. Late completion
cannot mutate a frozen result. Actual evidence continues through the typed
assessment, normalized concern, concern policy and unified finding/checklist
pipeline. There are no report-specific fallbacks or historical rewrites.

## Local verification

Focused tests cover request eligibility, initialization chains, hard caps,
cancellation/document drift, overflow, failures, exact registered prototype
methods, getter rejection and CMP retention on busy pages. A delayed-SDK browser
fixture verifies that the existing passive read captures configuration after
conditional settling, with one SDK request and no action.

Real MSNBC scan `ef26a21a-fe52-4690-a7cb-1289e1160b9e` used 1,458 ms of settling.
Its consent lane completed 4,505 ms before the policy lane's passive barrier,
so this visit added no publication tail. It still lacked usable full SDK and
choice evidence: three CMP checks were supported and ten remained unassessed.
The actual California report scored 85 with one canonical 15-point GPC deduction,
verified against the checksum- and size-matched original GPC worker artifact.
The broader paired GPC response remained indeterminate.

That visit ran under the approved 4,000 ms maximum; the final 2,500 ms operational
cap and final retention priority refinements were then fixture-tested. The
visit's 1,458 ms wait was below both caps. This report is evidence of the actual
visit, not a claim that the final source resolved the ten unsupported checks.
