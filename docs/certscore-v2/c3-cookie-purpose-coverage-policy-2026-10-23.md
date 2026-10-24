# CertScore.ai C3 cookie-purpose coverage — October 23, 2026

The owner authorized local implementation, regression coverage and retained-evidence verification for Fundraise Up, Siteimprove and Sitecore. Deployment and historical report rewriting are not authorized.

## Exact documented identities

| Cookie | Canonical vendor | Purpose | Technical essentiality |
| --- | --- | --- | --- |
| `fundraiseup_stat` | Fundraise Up | Analytics | Non-essential |
| `fundraiseup_cid` | Fundraise Up | Security / fraud prevention | Essential |
| `nmstat` | Siteimprove | Analytics | Non-essential |
| `szcib` | Siteimprove | Consent-state storage | Essential |
| `SC_ANALYTICS_GLOBAL_COOKIE` | Sitecore | Analytics | Non-essential |
| `SC_TRACKING_CONSENT` | Sitecore | Consent-state storage | Essential |

Primary sources reviewed on October 23, 2026:

- [Fundraise Up cookie documentation](https://fundraiseup.com/docs/cookies/).
- [Siteimprove Analytics cookies](https://help.siteimprove.com/support/solutions/articles/80000863908-siteimprove-analytics-cookies).
- [Sitecore 10.3 cookie documentation](https://doc.sitecore.com/xp/en/developers/103/platform-administration-and-architecture/cookies-used-by-sitecore.html).

These are case-sensitive, exact cookie identities. Prefixes, suffixes, case variants, whitespace lookalikes and arbitrary cookies from these vendors do not inherit the new classification. Cookie rules do not classify local/session storage or establish network collection. Technical essentiality is a purpose classification, not a legal exemption or a conclusion about site compliance. Existing positive essentiality evidence remains neutral under the new Reject policy.

Fundraise Up receives a stable canonical entity identity. Siteimprove and Sitecore reuse their existing identities, so cookies and classified services count once per canonical entity. Fundraise Up recognition is limited to the exact cookie rules; this change introduces no hostname-wide network attribution.

## Version boundaries and canonical flow

New classification uses `certscore.cookie-purpose.v7` and cookie-provider resolver `certscore-cookie-provider-2026-10-23-v5`. The general request resolver remains v14. Historical cookie-purpose v1–v6 interpretations remain separate; retained v6 classification records remain readable.

New EU Reject materializations use `after_reject_nonessential_presence.v3-cookie-coverage` with `gdpr-eprivacy-posture.v24`. Historical Reject v1 and v2 retain their own interpretation and score-version eligibility. The normalized concern path explicitly continues to accept v2 cookie-only findings after the current-version bump. The existing 15/20/23/25/27/28/29/30 recipient schedule, 30-point family cap, overall v13 and full-site v12 remain unchanged. The D8 historical v22 cap fix remains in place, and v23 continues to use the 30-point cap.

Retained packet verification, authorized click, source/control/target binding, bounded path completion, cookie snapshot and request ancestry checks remain required. Classification feeds the persisted typed Reject assessment, normalized concern, concern policy, unified finding/checklist and canonical score. It does not create findings in display code. Customer-facing copy remains factual and contains no deduction explanation.

The local report materialization cache moves to v39 so newly built results use the current interpretation. This does not rewrite stored production reports. California collection qualification, GPC, the shared California recipient family and GPP policies are unchanged. Cookie presence alone does not establish active use, successful collection or sale/sharing purpose.

## Validation and retained evidence

Regression coverage exercises exact identities and provider provenance, neutral fraud/consent cookies, lookalikes, historical reads, canonical persistence and scoring, entity deduplication, source mutations, incomplete capture and changed targets. Verification results and reproducible replay scripts are retained under `artifacts/c3-cookie-coverage-2026-10-23/`.

The frozen daily cohort is `20261023T184455Z-manual-307d8d57`. Source packet bytes and receipt hashes are preserved. Candidate policy replay is local and explicitly separate from historical-version replay and production results.

The resolver, contract and focused web/API suites passed 1,029 tests. Resolver,
contract and web TypeScript checks passed. Historical replay passed 5,279 checks
across all 341 completed scans. Proposed-policy replay passed 1,473 checks across
209 retained Reject packets, with exactly two changed scans:

| Retained scan | Added analytics cookies | Candidate EU score |
| --- | --- | --- |
| Sesame Workshop (`b98fa626-b246-4810-845b-578a67daa4fc`) | `fundraiseup_stat` | 89 → 74 |
| Nationwide Children’s (`d621c407-69ff-409b-b3db-6dc869a3fc58`) | `nmstat`, `SC_ANALYTICS_GLOBAL_COOKIE` | 44 → 40 |

These are internal audit results under the proposed policy, not changes to stored
customer reports. The other 207 retained Reject packets are unchanged in their
included cookie evidence and EU score effect. California scores remain unchanged.

## Capture and cost

No added visits, waits, retries, Options panels, lanes, model calls or capture budgets. The expected incremental recurring storage cost from additional retained classification/finding metadata is below $0.50/month at 100,000 scans/month and 30-day retention. There is no new paid API or infrastructure capacity. Production flags, the daily schedule and checkpoint are unchanged.
