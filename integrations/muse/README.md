# CertScore.ai Muse skill

The downloadable 1.0.3 package contains `SKILL.md`, Muse's `skill.yaml` manifest,
and a Python 3 MCP helper that selects curl when available, with a standard-library fallback. Native MCP tools take precedence.
The helper lists tools or makes one explicit call; it never polls or retries a
scan automatically. Installation does not start a scan.

Build the reproducible public asset after editing package sources:

```sh
python3 scripts/package-muse-skill.py
python3 scripts/package-muse-skill.py --check
python3 -m unittest discover -s integrations/muse -v
```

The builder includes three explicit files, excluding local caches and tests.
The website and Markdown guide link to the versioned ZIP under `/resources/`.
For a read-only live transport check, run the helper with `--list-tools`.
Do not use scan creation as an installation test.

Release validation: skill frontmatter, offline JSON/SSE/session/error transport
checks, a live initialization and four-tool listing, and archive/source parity.
The package was installed and exercised in Muse’s consumer app. Version 1.0.0
exposed truncated urllib responses in Muse’s VM proxy. Version 1.0.1 selects
curl before any request; direct tool listing, status and bundle commands then
succeeded on their first attempts using the retained test scan. Report links
and contextual follow-up metadata were preserved. No fresh-account test was
performed.

Estimated added static transfer at 100,000 downloads/month: below $0.25/month
(approximately 9.4 KB per ZIP). No new capacity, paid API calls, background jobs,
or scanner behavior is introduced.

## Repeat-use behavior

The skill finishes the requested answer, links the returned full report, and
may offer one relevant next step: retained evidence, a developer checklist,
a post-change recheck, another user-selected site, or a workspace connection.
It distinguishes reading an existing scan from creating one and avoids repeated
promotions, invented benefits, and unsolicited scans.

MCP Light already supplies `reviewNavigation`, evidence sections, response
follow-ups, comparison and checklist prompts, and the report URL. The helper
preserves the complete MCP result so Muse can use that guidance. No MCP service
or scanner changes are included in this web release.

MCP Light now supplies compact typed report and contextual follow-up actions
in response guidance, including under tight bundle budgets. Preserve terminal
and error gates and separate retrieval from scan creation. Reuse
existing permitted telemetry to assess subsequent evidence retrieval, report
opens where measurable, and requested rechecks. Do not add chat content capture,
redirect tracking, background scans, or new analytics infrastructure solely for
engagement. Judge useful follow-through rather than raw scan volume.

## Version 1.0.2

Consumer-Muse repeat-use testing covered a fresh test1 recheck against its
Ireland baseline, test2 from California, test3 from Germany, and switching the
same report between EU and California views. Report links opened the correct
scans; accepting the test2 checklist offer reused its existing scan.

The tested wording correction labels EU and California scores separately,
compares the same posture, preserves limited-coverage scores, and distinguishes
execution location from report focus. MCP Light supplies `reviewActions.reportViews`
with canonical scores, coverage and explicit focus links. The skill prefers
those links, avoiding an extra browser discovery step. One useful next step
may address a different priority page even when an earlier page already had a
checklist. No unsolicited scan or schedule is introduced.

The final helper only changes its client version from 1.0.1 to 1.0.2; its
transport behavior is unchanged. Offline regressions, skill validation and
archive/source parity remain release checks. The 10 KB ZIP adds approximately
$0.01/month in transfer at 100,000 downloads over 1.0.1. Combined incremental
MCP guidance and archive transfer is estimated below $0.10/month at 100,000
bundle responses and downloads each. There are no additional origin reads,
model calls, retained evidence, jobs or provisioned resources per response.

## Version 1.0.3

Comparisons now target 100–160 words, check each posture's page ordering before
claiming a reversal, and keep evidence and coverage ahead of a score-only priority.
Evidence selectors follow the current question instead of an unrelated earlier
section. Response-budget guidance retains the same scan. The helper changes only
its client version. The guide puts download/install first, offers copyable
same-scan evidence and report-view prompts, and keeps a matched-location recheck
for after a site change. HTML and Markdown share the same content; FAQ answers,
discovery links and download headers are updated together.

Estimated incremental static transfer is below $0.10/month at 100,000 guide visits
and downloads, including the larger skill instructions. No added runtime
capacity, origin calls per tool, scanner work, paid model calls or retention.
