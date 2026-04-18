# certscore.ai

## 1. Executive summary
- overall testing status: completed for the configured scenarios
- strongest observed risks: possible pre-consent tracking observed; reject path appears less easy than accept path; browser-level privacy signal did not appear to change first-load behavior
- confidence level: medium
- manual review recommended: yes

## 2. Consent UX scorecard
- banner present: yes
- reject-all first layer: no
- accept/reject click parity: inconclusive
- equal prominence assessment: inconclusive
- dark-pattern indicators observed: reject not detected on first layer

## 3. Pre-consent tracking summary
- cookies set before interaction: none classified as likely non-essential
- storage entries created before interaction: none classified as likely non-essential
- non-essential requests before interaction: https://certscore.ai/guides?_rsc=178l4; https://certscore.ai/_next/static/chunks/app/guides/page-3d977ac90e497628.js; https://certscore.ai/_next/static/chunks/app/guides/layout-013fee9fefbafcde.js
- likely vendors observed: DoubleClick

## 4. Reject-path effectiveness summary
- what changed after reject: 0 non-essential cookie(s) no longer present after reject; 3 fewer likely non-essential request(s) after reject
- what still fired after reject: none classified with current rules
- whether refresh preserved reject outcome: tracking-like activity still appeared or refresh evidence was inconclusive

## 5. Findings list
### F001 Possible pre-consent tracking signals on first load
- severity: high
- observation: On the fresh first-load scenario, network or storage activity matching likely analytics or advertising vendors was observed before any consent interaction was completed.
- whyThisMatters: If the activity is non-essential, reviewers typically expect it to be suppressed until a valid positive choice is completed.
- confidenceScore: 0.87
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-04-18T06-31-31.445Z/certscore-ai/fresh_visit/first-load.png; /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-04-18T06-31-31.445Z/certscore-ai/fresh_visit/banner.png
- uiText: Surface website evidence across privacy, consent, accessibility, and disclosures .Automated scanning for pre-consent tracking, consent flow failures, third-party data collection, disclosure gaps, accessibility signals, and policy-to-behavior contradictions. Built for teams that need reviewable evidence, not checklists.Scan a websiteSee sample findingsNo legal advice. No certification. Findings ref...
- cookies: none
- requests: https://certscore.ai/guides?_rsc=178l4; https://certscore.ai/_next/static/chunks/app/guides/page-3d977ac90e497628.js; https://certscore.ai/_next/static/chunks/app/guides/layout-013fee9fefbafcde.js
- storage: none
- pageUrls: https://certscore.ai/
- conservative wording: possible pre-consent tracking observed
- recommended next manual check: Confirm whether each retained request or identifier is genuinely non-essential in the tested region and whether any server-side gating explains the activity.

### F002 Reject path appears less direct than accept path
- severity: medium
- observation: A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.
- whyThisMatters: A deeper or less visible reject path can materially steer visitors toward acceptance even when a formal opt-out path exists.
- confidenceScore: 0.84
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-04-18T06-31-31.445Z/certscore-ai/fresh_visit/banner.png
- uiText: Surface website evidence across privacy, consent, accessibility, and disclosures .Automated scanning for pre-consent tracking, consent flow failures, third-party data collection, disclosure gaps, accessibility signals, and policy-to-behavior contradictions. Built for teams that need reviewable evidence, not checklists.Scan a websiteSee sample findingsNo legal advice. No certification. Findings reflect automated analysis of public website signals and should be reviewed in context.Scan a homepageStart with a lightweight homepage scan that previews the kinds of findings and observable signals CertScore can surface before signup.; No interaction wait completed for 12000 ms.
- cookies: none
- requests: none
- storage: none
- pageUrls: https://certscore.ai/
- conservative wording: reject path appears less easy than accept path
- recommended next manual check: Re-run interactively in the same region and confirm whether reject exists on hover, in a secondary tab, or only after expanding settings.

### F005 Browser-level privacy signal effect not evident
- severity: low
- observation: In the signal-enabled session, first-load tracking signals did not show a clear reduction relative to the control session.
- whyThisMatters: When a site represents that it honors browser-level choices, reviewers usually expect observable runtime suppression or clear confirmation.
- confidenceScore: 0.61
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-04-18T06-31-31.445Z/certscore-ai/fresh_visit_gpc/first-load.png; /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-04-18T06-31-31.445Z/certscore-ai/fresh_visit_gpc/banner.png
- uiText: Surface website evidence across privacy, consent, accessibility, and disclosures .Automated scanning for pre-consent tracking, consent flow failures, third-party data collection, disclosure gaps, accessibility signals, and policy-to-behavior contradictions. Built for teams that need reviewable evidence, not checklists.Scan a websiteSee sample findingsNo legal advice. No certification. Findings reflect automated analysis of public website signals and should be reviewed in context.Scan a homepageStart with a lightweight homepage scan that previews the kinds of findings and observable signals CertScore can surface before signup.
- cookies: none
- requests: https://certscore.ai/guides?_rsc=178l4; https://certscore.ai/_next/static/chunks/app/guides/page-3d977ac90e497628.js; https://certscore.ai/_next/static/chunks/app/guides/layout-013fee9fefbafcde.js
- storage: none
- pageUrls: https://certscore.ai/; https://certscore.ai/
- conservative wording: browser-level privacy signal did not appear to change first-load behavior
- recommended next manual check: Check whether the site states that it honors GPC or similar browser-level signals and, if so, retest with a browser extension or alternate locale to confirm runtime handling.

## 6. Final classification
- possible pre-consent tracking

