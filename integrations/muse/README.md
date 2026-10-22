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
(approximately 6.3 KB per ZIP). No new capacity, paid API calls, background jobs,
or scanner behavior is introduced.
