# Report Surfacing Policy

This module is the versioned, deterministic promotion layer for unified findings.

## How it works

1. The scan pipeline still normalizes concerns and builds unified finding packets first.
2. The surfacing engine evaluates those packets after evidence has already been assembled.
3. Every current unified finding id must have an explicit policy entry.
4. Family defaults provide conservative starting behavior.
5. Finding-specific rules and explicit precedence rules adjust the final outcome.

## Decision model

Each finding receives:

- `decisionState`: `confirmed | review | support_only | suppressed`
- `reportLane`: `main | confidence_and_coverage | suppressed`
- `surfaceTier`: `headline | section | secondary | support`
- explicit `decisionReasons`
- stable `appliedRules`

## Family defaults vs per-finding overrides

- Family defaults define the conservative baseline for a group of findings.
- Per-finding entries keep every id explicitly covered.
- Higher-impact findings can override their family default tier or lane without changing engine logic.

## Adding a new finding policy safely

1. Add the new unified finding to the canonical registry first.
2. Add an explicit policy entry in `UNIFIED_FINDING_SURFACING_POLICY_REGISTRY`.
3. Re-run the validator tests.
4. Add or update precedence rules only if the new finding overlaps with an existing lead finding.

## Updating precedence rules safely

- Use explicit pair rules instead of broad hidden heuristics.
- Prefer support relationships before suppression unless the weaker finding becomes misleading.
- Keep precedence rules small and inspectable.

## Avoiding policy drift

- Do not scatter surfacing logic across unrelated files.
- Prefer registry edits and explicit rule additions over one-off conditionals.
- Keep evidence-strength logic separate from importance and prominence.
- Retain suppressed findings in debug output with reasons.

## Versioning

- `REPORT_SURFACING_POLICY_VERSION` identifies the active policy behavior.
- Bump the version when behavior changes intentionally in a way that should be reflected in fixtures or downstream consumers.
