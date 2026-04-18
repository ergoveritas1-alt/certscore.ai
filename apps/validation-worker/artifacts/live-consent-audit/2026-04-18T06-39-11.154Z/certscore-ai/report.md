# certscore.ai

## 1. Executive summary
- overall testing status: completed for the configured scenarios
- strongest observed risks: reject path appears less easy than accept path
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
- non-essential requests before interaction: none classified with current rules
- likely vendors observed: none classified with current rules

## 4. Reject-path effectiveness summary
- what changed after reject: 0 non-essential cookie(s) no longer present after reject; 0 fewer likely non-essential request(s) after reject
- what still fired after reject: none classified with current rules
- whether refresh preserved reject outcome: no obvious reintroduction observed on refresh

## 5. Findings list
### F002 Reject path appears less direct than accept path
- severity: medium
- observation: A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.
- whyThisMatters: A deeper or less visible reject path can materially steer visitors toward acceptance even when a formal opt-out path exists.
- confidenceScore: 0.84
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-04-18T06-39-11.154Z/certscore-ai/fresh_visit/banner.png
- uiText: Surface website evidence across privacy, consent, accessibility, and disclosures .Automated scanning for pre-consent tracking, consent flow failures, third-party data collection, disclosure gaps, accessibility signals, and policy-to-behavior contradictions. Built for teams that need reviewable evidence, not checklists.Scan a websiteSee sample findingsNo legal advice. No certification. Findings reflect automated analysis of public website signals and should be reviewed in context.Scan a homepageStart with a lightweight homepage scan that previews the kinds of findings and observable signals CertScore can surface before signup.; No interaction wait completed for 12000 ms.
- cookies: none
- requests: none
- storage: none
- pageUrls: https://certscore.ai/
- conservative wording: reject path appears less easy than accept path
- recommended next manual check: Re-run interactively in the same region and confirm whether reject exists on hover, in a secondary tab, or only after expanding settings.

## 6. Final classification
- possible consent UX issue

