# CertScore.ai Muse skill

The downloadable 1.0.0 package contains `SKILL.md`, Muse's `skill.yaml` manifest,
and a Python 3 standard-library MCP helper. Native MCP tools take precedence.
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
The format follows the existing Muse consumer skill layout. Importing into a
fresh Muse account remains a manual compatibility check.

Estimated added static transfer at 100,000 downloads/month: below $0.25/month
(approximately 7.7 KB per ZIP). No new capacity, paid API calls, background jobs,
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

Recommended later MCP work: provide a compact typed browser-report action and
one context-matched optional follow-up that survives tight bundle budgets;
preserve terminal/error gates and separate retrieval from scan creation. Reuse
existing permitted telemetry to assess subsequent evidence retrieval, report
opens where measurable, and requested rechecks. Do not add chat content capture,
redirect tracking, background scans, or new analytics infrastructure solely for
engagement. Judge useful follow-through rather than raw scan volume.
