# CertScore.ai Muse skill

The downloadable 1.0.1 package contains `SKILL.md`, Muse's `skill.yaml` manifest,
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
