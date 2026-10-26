# CertScore.ai Muse announcement readiness — October 26, 2026

Scope: guide copy/demo links and fresh LinkedIn/X announcement assets. The launch
worktree starts at live web aad0c633f49dd20dbf55e169e136deec0f323ef2, keeping
unrelated unfinished work in the original checkout out of this release.

The original social graphics used the October 22 test1 report (10 GDPR). The
current owned test1 adds LinkedIn activity, and current scoring policies differ.
Fresh, owner-authorized scans from Ireland returned:

| Demo | GDPR/ePrivacy | California | Report |
| --- | ---: | ---: | --- |
| test1 | 32 | 35 | https://certscore.ai/scan/14ee70d1-05a3-4f6d-b7a2-5bfc4ef5b3ab |
| test2 | 40 | 53 | https://certscore.ai/scan/a3c8b1a2-b8d2-4808-964d-3b07ec3095ae |

California coverage is limited on both; test2 also has limited policy and
accessibility coverage. Do not reuse the former 10/30 or 28/44 promotional
numbers, promise a target score, or modify the owner's canaries to fit a graphic.

Guide changes identify deliberately failing owned demos, link the dated example
reports and add a matched-location comparison prompt. Visible FAQ and JSON-LD
share the same source, as does the Markdown view. Example cards avoid fixed
scores so a later canary update does not become a promise about a fresh scan.

The live 1.0.4 ZIP matches its three source files exactly (10,832 bytes, SHA256
b844217a860ec696d2ac79625b365f2789c83ef648f3a515b0ab60f88aac1b18). Its workflow
handles current reports; no package/version change is necessary merely because
a demo page changed. Keep the same verified public download.

Preliminary checks: live metadata/canonical/social, FAQ/HowTo parity, Markdown,
LLM discovery, ZIP/source/header parity, robots and sitemap all passed. A fresh
Muse side chat installed the actual downloaded ZIP, read the skill and verified
all four tools without scanning. Its first review returned the correct 32 GDPR
and 35 California scores, coverage and contextual evidence link; clicking it
opened the matching pre-consent evidence. Further launch checks and deployment
results are recorded below after completion.

The clean worktree first needed generated shared-package builds before the
release gate; no source fix or weakened check was used. No scanner, scoring,
validation, capacity, capture-budget, retention or MCP server changes.

Estimated recurring increment for small guide text/link additions: below
$0.10/month at 100,000 guide visits. Download package unchanged. Social graphics
are local files for the owner to post; no social publication is authorized here.

## Local release verification

Change-aware fast preflight against live aad0c633 passed: 2776 tests,
0 failures, 1 skips, including the web typecheck and canonical
report/consent release contracts. Local HTML/Markdown/FAQ/HowTo parity, social
metadata, discovery links, ZIP headers/source parity, robots and sitemap pass.
The downloaded helper also passed current 5 KB and 8 KB reads for both reports,
preserving posture scores and report actions (5 KB bodies: 4,935 and 4,873 bytes).

Muse's first review and short comparison used the current scores and correct
ordering. A follow-up described the verified Reject action and Google activity
at +114 ms, preserving the intentionally unmeasured remainder. Both returned
evidence links were clicked and landed on the matching expanded report section.
The announced screenshots use the same test1 scan and include coverage context.

Fresh LinkedIn/X PNGs, post copy, alt text, provenance, editable SVGs and a ZIP
are at /Users/benmasek/WC01/output/muse-social-2026-10-26/. X copy is 246 weighted
characters, with a platform-tagged guide link. No social posts were published.
Only the public web guide is selected for AWS deployment.

## Production verification

AWS web workflow succeeded for 1086efdb97897072b9ceadca92e30c78d3d8391a:
https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/40407148829

The public /api/version confirms that exact SHA on ECS/Fargate. Web task
certscore-web-certscore:780 is stable at 2/2, materializer task
certscore-web-certscore-materializer:343 at 1/1; both deployments COMPLETED, zero
pending. Live HTML/Markdown, new demo links/prompt/date, FAQ/HowTo parity, canonical
and social metadata, LLM discovery, robots/sitemap, download headers and exact
ZIP/source parity all pass. The new demo section was also inspected in a browser.

The stable 1.0.4 ZIP is unchanged and working. Refreshed announcement assets are
ready for owner publication, using the October 26 test1 report (32 GDPR /
35 California), with no visible scan ID. Current test2 is 40 GDPR / 53 California;
older target-score assumptions were not reused. No social posts were published,
no owner canary changes or unrelated unfinished local work were deployed.
