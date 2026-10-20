# ErgoVeritas test 1 showcase canary

## Scope and approval

The owner requested richer observed evidence for the PDF demonstration and
approved publication of the validated test1 assets to the existing ErgoVeritas
AWS site, followed by a canary-only commit in an isolated checkout. The corrected
target is `https://ergoveritas.com/test1.html`, not the misspelled hostname.
Existing PDF/scoring implementation work remains untouched in the main checkout.
No CertScore.ai app or scanner production deployment is included.

## Evidence designed into the page

| Area | Real page content | Verification |
| --- | --- | --- |
| Policy discovery | Visible same-origin Privacy Policy links | Policy lane fetches the exact linked document |
| Transparency | Nine substantive topic disclosures | Retained sections and canonical concern-policy/checklist test |
| Accessibility | Missing image alternative, unlabelled email input, unnamed icon button | Bundled axe-core 4.11.3 detects all three serious/critical rules |
| Forms | Five empty personal-information fields and a local notice | Existing form capture retains field categories and linked notice |
| Integrity | One off-screen link to reserved `promotion.example` | Runtime capture retains domain, concealment and code proof without navigation |
| Consent | Original controls and shared runtime unchanged | Six initial requests; Accept remains unconfirmed; Reject registers denied then starts its intentional extra request |

Policy topics are controller contact, processing purposes, legal basis,
recipients, retention, rights, transfers, supervisory-authority complaints and
automated decision-making/profiling. The fictitious contact is clearly identified
as non-deliverable and no DPO appointment is asserted. A disclosure being
Observed does not validate its legal sufficiency or operational fulfilment.

The form accepts invented text for DOM realism but does not submit, serialize,
store or send it. The preview button only writes a fixed status message.
Submit-event prevention and a form-action CSP independently block submission.
Browser tests exercise native submission, including with page JavaScript off,
and verify that no form request or form values enter network/storage.

## Canonical boundaries

Only static canary assets and their tests/publication helper change. No finding,
confidence, score, or report-display override is added. New report evidence must
come from a fresh scan through the normal retained-evidence and canonical
projection pipeline. The historical 17-page PDF and score remain historical;
a richer page can legitimately produce a different score and page count.
The owned/synthetic disclosure treatment remains unchanged.

## Cost

Estimated incremental static hosting/storage is below $0.10/month at current
canary traffic and one-time publication/checksum verification below $0.05.
There is no new service, schedule, lane, timeout, model invocation policy,
retention rule or provisioned capacity. The owner-requested fresh scan uses the
existing pipeline; no recurring scan is added.

## Validation and publication

The dedicated test1 browser tests and canonical transparency test pass locally.
Six browser tests cover test1, test2 and hidden-link capture; 41 web tests cover
transparency adaptation, accessibility evidence and integrity projection. Web
and scan-core typechecks pass in the primary checkout. Desktop/mobile page and
linked-policy renders were visually checked. Shell syntax and publication dry
run pass.

Two existing `form-disclosure-browser.test.ts` assertions fail because they
expect `undefined` for an inspected empty form notice while the current v2
contract retains an empty completed inspection. The same failures reproduce
against untouched HEAD scanner/test sources in the isolated checkout. They are
not changed here; test1's form-notice capture test passes.

Source revision, publication receipt and the fresh localhost report are recorded
alongside the local output artifacts after verification. Publication is
restricted to `test1-privacy-policy.html` and `test1.html`; the shared runtime is
verified but never uploaded.
