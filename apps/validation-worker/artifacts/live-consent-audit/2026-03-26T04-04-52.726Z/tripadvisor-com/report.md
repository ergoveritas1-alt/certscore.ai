# tripadvisor.com

## 1. Executive summary
- overall testing status: completed for the configured scenarios
- strongest observed risks: reject path may not suppress non-essential tracking
- confidence level: medium
- manual review recommended: yes

## 2. Consent UX scorecard
- banner present: no
- reject-all first layer: inconclusive
- accept/reject click parity: inconclusive
- equal prominence assessment: inconclusive
- dark-pattern indicators observed: none programmatically confirmed

## 3. Pre-consent tracking summary
- cookies set before interaction: none classified as likely non-essential
- storage entries created before interaction: ddOriginalReferrer=
- non-essential requests before interaction: none classified with current rules
- likely vendors observed: none classified with current rules

## 4. Reject-path effectiveness summary
- what changed after reject: 0 non-essential cookie(s) no longer present after reject; 0 fewer likely non-essential request(s) after reject
- what still fired after reject: none classified with current rules
- whether refresh preserved reject outcome: tracking-like activity still appeared or refresh evidence was inconclusive

## 5. Findings list
### F003 Reject path may not fully suppress non-essential activity
- severity: high
- observation: After an explicit reject-path interaction, likely non-essential requests or identifiers still appeared during the post-choice or refreshed session.
- whyThisMatters: A reject control that does not materially change runtime behavior can indicate that the consent surface is not effectively governing optional tracking.
- confidenceScore: 0.82
- screenshots: none
- uiText: No consent surface detected with current heuristics on the tested first load.; No reject action detected.
- cookies: none
- requests: https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMAf7i8oXyAcXYAQhtA-A%3D%3D&hash=2F05D671381DB06BEE4CC52C7A6FD3&cid=XS3gYYhJ5r34pq6iSOGkTRuMyzrmyFrdjzh46gZCxoZQgoMGui5wsWUMYFNf4ce0aKKCkZw9wwG~DClY1vtkoqgKBGm5febZzFnAiEoBNlW3beOcvBsqorUfsLM1BPgn&t=bv&referer=https%3A%2F%2Ftripadvisor.com%2F&s=46694&e=13734bd22ceef9ce8b92d4003436a26b10532f65bdc94692fc6a421ea28beea6db76906b2f9aaa14086b7ed985f304e3&dm=cd
- storage: ddOriginalReferrer=
- pageUrls: https://tripadvisor.com/
- conservative wording: reject path may not suppress non-essential tracking
- recommended next manual check: Confirm whether the retained vendors are actually consent-gated in this geography and whether the reject control modified any consent string despite continued requests.

## 6. Final classification
- reject path may not suppress non-essential tracking

