# CertScore.ai MCP Light: prioritized 30-day organic growth plan

## Execution snapshot — August 30, 2026

- Priority 0 is complete: the canonical identity, publisher, version, links, three-tool contract, structured metadata, social card, discovery manifests, and tracked CTAs are verified and live.
- GitHub MCP Registry publication is complete at `https://github.com/mcp/ai.certscore/mcp-light`. The GitHub-rendered package README now leads with the no-auth Light identity, exact three-tool workflow, tracked landing-page CTA, and copy-ready owned-canary prompt.
- The privacy-separated growth funnel is deployed. It measures MCP initialization, tool discovery, first tool, scan request, completed-bundle retrieval, and seven-day/30-day repeat use without retaining prompts, target URLs, raw IPs, tokens, or scan evidence.
- `/mcp/light`, `/developers/mcp`, `/releases/mcp-light`, and the homepage are discoverable in current web search results. Live canonical, index/follow, social metadata, sitemap, robots, `llms.txt`, and production MCP checks pass.
- The Official MCP Registry release target is `0.2.18`. Its API also retains older immutable versions, including the stale `0.2.12` 20-scan description; downstream indexes must select the registry record marked `isLatest: true`.
- This execution batch adds the technical article at `/guides/mcp-website-privacy-scanner` plus contextual links from the cookie-consent and privacy-policy solution pages.
- Remaining account actions: brand-channel publication of the GitHub launch and demo, Claude/OpenAI/Cline/Kilo submission buttons, search-console URL inspection, and any free third-party maintainer recrawl requests. Cursor remains paused.

## Outcome and measurement boundary

The primary outcome is more non-internal completed MCP scans followed by useful bundle retrieval and repeat use. The measurement model deliberately separates two funnels that cannot be joined at an individual level without adding invasive cross-site identifiers:

```text
Discovery funnel (consented first-party web analytics)
qualified landing session → install/setup action → live-demo scan

Product funnel (essential privacy-minimized MCP telemetry)
MCP initialize/tools list → first tool invocation → scan request → completed scan → bundle retrieval → repeat actor/session
```

Marketplace impressions and installs remain provider-owned and are unavailable unless a marketplace supplies aggregate analytics. Do not estimate them from CertScore request counts.

North-star metric: weekly non-internal actors that retrieve a completed Light MCP findings bundle.

Supporting metrics:

- qualified `/mcp/light` sessions by source and campaign
- Cursor install, Cursor Directory, registry, setup-copy, and live-demo actions
- Light MCP initialized sessions and successful tool-list operations
- scan requests, new/reused decisions, completion rate, and median completion time
- bundle-per-scan ratio and excessive status-poll ratio
- seven-day and 30-day repeat actors, measured only from existing opaque operational identifiers
- error, rate-limit, limited-result, and connection-failure rates

Use days 1–7 as the baseline. For days 8–30, aim for a 25% increase in weekly qualified landing sessions and a 20% increase in weekly non-internal completed-bundle actors relative to that baseline, without increasing error or rate-limit rates. These are operating targets, not claims about current performance.

## Priority 0: correctness and conversion readiness (days 1–3)

1. Keep one canonical identity everywhere: `CertScore.ai MCP Light`, `ai.certscore/mcp-light`, hosted MCP `0.2.18`, publisher `CertScore.ai, LLC`.
2. Verify the Official MCP Registry record, Cursor Directory page, endpoint, icons, privacy/terms/support URLs, and exact three-tool contract.
3. Correct stale owner/version copy in submission packets and manifests.
4. Add structured SoftwareApplication, FAQ, and breadcrumb metadata plus the 1200 × 630 social card to the landing page.
5. Add current registry identity, version, publisher, and directory links to `llms.txt` and `llms-full.txt`.
6. Validate channel-specific UTM capture and stable CTA identifiers without recording target URLs or form values.

Exit condition: the automated distribution check and focused web/MCP tests pass; public links resolve; the production MCP initializes and lists exactly three tools.

## Priority 1: finish high-intent distribution (days 3–7)

1. Cursor action is paused at the product owner's request as of August 29, 2026. Preserve the verified Directory and pending Marketplace status, but do not monitor, resubmit, or install until the owner resumes it.
2. Submit the prepared Claude package using publisher `CertScore.ai, LLC` and version `0.2.18`.
3. Create the OpenAI **With MCP** draft using the Universal no-auth endpoint and bundled provider-neutral skill. Re-run Scan Tools immediately before submission and after any schema change.
4. Submit Cline using the prepared repository URL, agent install guide, 400 × 400 PNG, and evidence-bounded description.
5. Submit the prepared Kilo `MCP.yaml` through the current Kilo marketplace repository and checks.
6. Record platform submission IDs, dates, assigned URLs, reviewer feedback, and final status in `docs/mcp-light-submission-packets.md`.

Owner interaction: account login, attestations, organization/domain verification, CAPTCHA/email verification, and final submission buttons.

Exit condition: all four packages are either submitted with a recorded review state or blocked by one explicit owner action.

## Priority 2: launch one factual narrative (days 5–12)

1. Publish the LinkedIn post and X thread from `docs/gtm/mcp-light-launch-content.md` within the same 24-hour window.
2. Publish the GitHub release/discussion post and pin the MCP Light section or release link where the repository UI permits.
3. Share the community post in two relevant MCP/agent-development communities that allow project launches. Tailor the opening sentence, but keep facts and disclaimers canonical.
4. Publish the technical article about the three-tool lifecycle, fail-closed evidence, and privacy-minimized telemetry.
5. Reply to substantive setup questions with direct documentation links; do not turn support replies into legal interpretations.

Cadence: one primary launch, then no more than two substantive follow-ups per channel in the first week.

Exit condition: every channel has a uniquely attributed link and one clear first-run prompt; no channel claims Cursor Marketplace approval before it exists.

## Priority 3: capture search and agent discovery (days 8–18)

1. Request recrawl/indexing for `/mcp/light`, `/releases/mcp-light`, the MCP developer page, and the technical article in the already-configured search consoles.
2. Confirm sitemap inclusion, canonical URL, index/follow directives, social card rendering, JSON-LD validity, and `llms.txt` reachability.
3. Add two contextual internal links to MCP Light from the most relevant high-intent pages after checking that the pages do not already link prominently.
4. Refresh the public GitHub repository description/topics through the owner account to include MCP, privacy, website analysis, cookies, and consent without overclaiming compliance.
5. Ask stale third-party indexes to recrawl only where they offer a free maintainer workflow. Do not purchase placement or badges.

Exit condition: owned discovery surfaces expose the current version and 50-scan Light allowance; search-console submission is recorded; no duplicate or contradictory listing identity remains.

## Priority 4: turn first use into repeat use (days 12–24)

1. Publish the setup walkthrough with the reusable canary and exact terminal workflow.
2. Publish one use-case prompt each for launch review, vendor review, and audit diagnostics.
3. Publish the reuse explainer: ordinary `freshness=latest`, explicit provenance, and free eligible reuse.
4. Add a concise “scan another site / repeat this review” next step only on MCP documentation or completed MCP-facing results where it cannot be confused with a finding.
5. Review actual failure telemetry weekly and fix the highest-volume connection, polling, invalid-URL, truncation, or rate-limit friction before adding more acquisition copy.

Exit condition: bundle-per-scan ratio improves versus days 1–7 and repeat actors are measurable without a decline in completion rate.

## Priority 5: learn and compound (days 22–30)

1. Compare channel cohorts using aggregate sessions, CTA actions, MCP caller-family signals, completed bundles, and repeat actors. Keep attribution confidence visible.
2. Identify the two channels producing the most completed-bundle actors, not merely clicks.
3. Repurpose the strongest technical explanation into a short follow-up and one documentation improvement.
4. Publish a transparent 30-day update with shipped integrations, workflow improvements, and observed aggregate usage only after suppressing small or identifying cohorts.
5. Set the next 30-day plan around the strongest qualified sources and the largest verified friction point.

Exit condition: written review includes baseline, current period, attribution limitations, completion/bundle/repeat rates, errors, learnings, and the next three experiments.

## Weekly operating review

Every Monday:

1. Exclude internal QA, canaries, and Mac mini scan-bot traffic using the existing admin controls.
2. Record landing sessions and stable MCP Light CTA actions by source/campaign.
3. Record Light sessions/actors, scans, successful bundles, reuse, polling ratio, errors, rate limits, and p50/p95 latency.
4. Review the top three error codes and any reviewer feedback from pending listings.
5. Choose one distribution action and one product-friction fix for the week.

## Cost and safety

This plan adds no advertising, paid directory placement, external analytics service, scheduled canary, model call, or provisioned capacity. Repository work and existing first-party telemetry are cost-neutral apart from ordinary negligible request/storage usage already covered by the service. Any proposed recurring cost increase of at least $1/month requires separate product-owner approval.
