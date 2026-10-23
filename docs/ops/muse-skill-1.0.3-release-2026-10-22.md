# CertScore.ai Muse skill 1.0.3 and guide

The owner authorized tightening comparison behavior, updating the download,
optimizing the Muse guide for people and agents, and deploying the web changes.

## Skill and package

Comparisons target 100–160 words unless detail is requested. Check the relative
page ordering within each posture before saying a ranking reverses; a page's
own EU/California score change does not establish a cross-page reversal. Keep
findings and coverage in the recommendation, with labeled reports. Select
evidence for the current question rather than carrying a prior section across
pages. Response-budget corrections retain the same scan.

The reproducible three-file 1.0.3 ZIP is 10,508 bytes. Its helper changes only
the client version; transport, tool access, authorization and scan behavior are
unchanged. Prior versioned packages remain available.

Consumer Muse was given the revised comparison instructions and both retained
test1/test2 scans. It returned a compact score table, evidence differences,
coverage caveat and labeled links, correctly keeping test1 first in both views.
No new scans were created. This is an observed improvement in that conversation,
not a guarantee about every future model answer.

## Guide and discovery

The download is visible in the hero and installation comes before connection
details. Copyable prompts support the first review, existing-scan evidence,
developer handoff, EU/California views and a post-change recheck. A visual
baseline/change/recheck/compare flow preserves location, focus and coverage.
Technical connector/workflow details are available in disclosures. The OAuth
copy distinguishes revisiting a known Light scan from saved workspace history.

SEO/AEO: specific title and concise description, retained canonical/social
metadata, crawlable server-rendered text, matching visible FAQ/FAQPage answers,
updated HowTo anchors, Markdown alternate and reciprocal canonical, and updated
skill links in both LLM guides and the AI discovery document. Existing robots
allowances and sitemap inclusion are verified. The ZIP retains download headers
and noindex. No search-ranking or rich-result guarantee is claimed.

## Validation and release scope

- Skill validator, 11 offline helper tests and deterministic ZIP/source parity.
- Change-aware preflight: 2,049 tests passed; final web typecheck checks the
  final UI/copy state. Initial local Turbopack inspection hit an existing sibling
  `.js` resolution issue; the repository's configured Webpack resolver rendered
  the guide successfully. Production uses the existing checked-in build path.
- Desktop and 390-pixel mobile visual review; guide prompts stack and wrap.
- Rendered metadata, canonical/social/Markdown links, FAQ parity, HowTo anchor
  targets, discovery downloads, robots and sitemap checks pass locally.
- Deploy public web only through the canonical AWS workflow, comparing against
  live web `d7b527abaec3d761662acc2e6948e36fa5317237`. No scanner, database,
  validation or MCP service rollout is needed. Preserve MCP image `702269518`.
- Require exact-SHA successful workflow, stable ECS, live `/api/version` with
  `ecs-fargate`, final download/source parity and the same SEO/AEO checks live.

Cost: estimated added static transfer below $0.10/month at 100,000 guide visits
and downloads. No extra runtime capacity, origin reads per MCP call, scanner
work, model/API calls, schedules or retention are introduced.
