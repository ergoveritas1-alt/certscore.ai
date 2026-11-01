# CertScore.ai retained audit-fix regression gate — October 30, 2026

The accumulated local repairs share canonical contracts, classifiers and public
projection paths. Before adding more product changes, validate the combined
candidate with one repeatable, bounded offline command:

```sh
pnpm test:retained-audit-fixes
```

The gate runs forty-nine explicitly selected suites covering first-layer controls,
initial/terminal choice confirmation, bounded receipt availability, policy topics
and source identity, exact cookie purposes, capture checkpoint accounting and
historical version binding. Receipt integration checks use temporary loopback
servers and local Chromium; the test process needs permission to bind localhost.
It then typechecks the four changed shared packages and the focused web/fixture
dependency graph. It does not run deployment workflows, broad product suites,
public targets, production scans, cloud queries or model/API calls.

Use Node 22–24 as required by the repository. No package installation or build
step is performed by the gate. A new shared-package export requires preparing
that package with its existing build command first, because package typechecks
resolve built workspace declarations. Retain that preparation's log/exit code
alongside the gate receipt. Tests use the existing local TypeScript runtime. Checks run
serially and stop on failure. Full output is saved in a fresh audit artifact
directory, with exit codes, durations and log hashes in validation-receipt.json.
An optional `--out FRESH_DIRECTORY` chooses a new output directory; existing
directories are rejected so previous receipts cannot be overwritten.

The receipt identifies Git HEAD plus hashes of the pending source changes,
fixtures and command configuration. It verifies that those inputs remain
unchanged for the whole run. A source change or failed check produces a failed
receipt. This is a local regression gate, not deployment authorization or a
production improvement measurement. Existing dashboards and source pins are not
repinned or published.

The command adds $0 paid or recurring infrastructure usage. No scan, capture,
retention, service, capacity, privacy-action or model budget changes. Review and
an authorized release remain separate from a successful local receipt.
