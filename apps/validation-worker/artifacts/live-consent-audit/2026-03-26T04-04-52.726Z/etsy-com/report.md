# etsy.com

## 1. Executive summary
- overall testing status: completed for the configured scenarios
- strongest observed risks: possible pre-consent tracking observed
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
- non-essential requests before interaction: https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMAdho2EbgmSV4AQhtA-A%3D%3D&hash=D013AA612AB2224D03B2318D0F5B19&cid=6gUQNuQRln06uguW9OeUO5OlymPzCsG525Fk0MpI1mHbk1MBgoQ5fReKl4fZEsiDeAae956dM~X9G~rNaJe8Fu9wiYkSu2j6rhoAjP0~mLI9u2HtUogr206q7U8NZi7a&t=bv&referer=https%3A%2F%2Fwww.etsy.com%2F&s=45225&e=92d207d26a9a73ca6253fad6bcb1a93a1e7541bdbee64c01204f4e2b41d5072a84ac0ab4ef37acb74c25cd41e13e2ace&dm=cd
- likely vendors observed: DoubleClick

## 4. Reject-path effectiveness summary
- what changed after reject: 0 non-essential cookie(s) no longer present after reject; 1 fewer likely non-essential request(s) after reject
- what still fired after reject: none classified with current rules
- whether refresh preserved reject outcome: no obvious reintroduction observed on refresh

## 5. Findings list
### F001 Possible pre-consent tracking signals on first load
- severity: high
- observation: On the fresh first-load scenario, network or storage activity matching likely analytics or advertising vendors was observed before any consent interaction was completed.
- whyThisMatters: If the activity is non-essential, reviewers typically expect it to be suppressed until a valid positive choice is completed.
- confidenceScore: 0.72
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T04-04-52.726Z/etsy-com/fresh_visit/first-load.png
- uiText: none
- cookies: none
- requests: https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMAdho2EbgmSV4AQhtA-A%3D%3D&hash=D013AA612AB2224D03B2318D0F5B19&cid=6gUQNuQRln06uguW9OeUO5OlymPzCsG525Fk0MpI1mHbk1MBgoQ5fReKl4fZEsiDeAae956dM~X9G~rNaJe8Fu9wiYkSu2j6rhoAjP0~mLI9u2HtUogr206q7U8NZi7a&t=bv&referer=https%3A%2F%2Fwww.etsy.com%2F&s=45225&e=92d207d26a9a73ca6253fad6bcb1a93a1e7541bdbee64c01204f4e2b41d5072a84ac0ab4ef37acb74c25cd41e13e2ace&dm=cd
- storage: ddOriginalReferrer=
- pageUrls: https://www.etsy.com/
- conservative wording: possible pre-consent tracking observed
- recommended next manual check: Confirm whether each retained request or identifier is genuinely non-essential in the tested region and whether any server-side gating explains the activity.

## 6. Final classification
- possible pre-consent tracking

