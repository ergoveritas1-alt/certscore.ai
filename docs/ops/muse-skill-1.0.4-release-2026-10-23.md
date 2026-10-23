# CertScore.ai Muse skill 1.0.4 and contextual report links

The owner authorized contextual report links, evidence deep links, shorter Muse
responses, the updated public download, and deployment and end-to-end Muse testing.

## Change

MCP Light 0.2.31 exposes bounded contextual links over supported identities in
returned canonical findings. Focused report-evidence pages expose links over
their returned finding entries. The generic report action remains the fallback.
Links preserve the exact scan and access parameters; GDPR evidence links select
the GDPR review focus, while requested California views retain their own links.
No finding, classification, score, capture, persistence, read budget, scan quota
or evidence eligibility changes. Unsupported and omitted identities do not
create evidence claims or guessed anchors. Shared report-target constants keep
the MCP actions aligned with web evidence navigation.

Incoming report fragments open their collapsed evidence ancestors, resolve the
existing shared evidence aliases, highlight the destination and scroll/focus it.
Incoming aliases remain stable when the page is reloaded or its URL is copied.
This shares the existing in-report evidence-jump behavior.

The Muse skill keeps routine reviews around 120–180 visible words and comparisons
around 100–160, counting tables, link labels and the optional follow-up. Scan IDs
stay internal unless requested or needed for recovery. Score labels identify
GDPR/ePrivacy or California (CCPA/CPRA). One relevant returned evidence link per
page explains the value of opening the report. Answers stay useful in chat and
no website visit is required to retrieve evidence available through the tools.

The deterministic 1.0.4 ZIP contains the same three files, 10,832 bytes, SHA256
`b844217a860ec696d2ac79625b365f2789c83ef648f3a515b0ab60f88aac1b18`.
The helper changes only its client version. The guide, Markdown view, both LLM
documents and AI discovery route advertise the new download. Older packages stay
available. Public hosted-version metadata advances to 0.2.31; this release does
not publish an npm package or desktop archive.

## Readiness and release scope

- Change-aware preflight against live web `7c18f1b2a670c90f6c0cf7f93171d5e219184c24`:
  2,048 passing tests, zero failures, one existing skip.
- Final MCP dependency/HTTP typecheck, web typecheck, 178 MCP tests, 27 focused
  navigation/guidance tests and two web report-target tests pass.
- Skill validator, 11 helper tests, deterministic ZIP/source parity and MCP
  release guards pass. The first local release-asset check had a direct-fetch
  network timeout; the authenticated GitHub CLI asset check passed.
- Browser component verification opens nested pre-consent evidence and the shared
  Reject alias on arrival and reload, without a database or scan connection.
- Local guide verification passes metadata, canonical/social, FAQ/HowTo parity,
  Markdown, discovery, ZIP headers/source parity, robots and sitemap checks.
  It caught missing attachment/noindex headers for the new version. The first
  web run was canceled before its image build; the header correction is a web-only
  follow-up commit. The independently verified MCP deployment retains its SHA.
- Target only the public web and hosted MCP AWS workflows from the committed,
  pushed branch. Preserve scanner, validation, capacity and runtime-base settings.
  The new API-contracts export contains navigation constants only and adds no
  evidence schema or validation/scanner behavior requiring those consumers to roll.
- Verify exact-SHA successful workflows, ECS stability, live web revision/runtime,
  MCP health and returned actions, live download/source parity, guide discovery,
  and the downloaded package in a fresh Muse conversation against retained
  test1/test2 reports. Record observed word counts, link destinations and any
  limitations in the local release evidence summary.

Cost: estimated incremental static and MCP guidance transfer below $0.10/month
at 100,000 guide visits, downloads and bundle responses. No added origin reads,
scan work, model calls per tool, schedules, retention or provisioned capacity.
