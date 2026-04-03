# Runtime Harness

Local harness for comparing browser runtime modes and validating hybrid auto-escalation behavior.

## Main commands

- `pnpm scan:runtime-harness -- --url https://example.com --mode auto`
- `pnpm scan:runtime-harness -- --url https://example.com --mode all`

## Hybrid auto decision checks

- `pnpm scan:runtime-harness:check-hybrid-auto-decision`
  Runs a small smoke check against the vendored hybrid auto decision logic.

- `pnpm scan:runtime-harness:check`
  Shortcut for the hybrid auto decision smoke check.

- `pnpm scan:runtime-harness:verify`
  Shortcut for the full local verification gate.

- `pnpm scan:runtime-harness:verify-hybrid-auto-decision`
  Runs the full local verification gate:
  `typecheck` + tests + hybrid auto decision smoke check.

## Notes

- The runtime harness is self-contained for hybrid auto decision logic.
- Hybrid auto decision precedence is intentional:
  challenge-like runtimes outrank generic thin-runtime heuristics, thin-success outranks origin-not-reached, and healthy full runtimes suppress escalation even if challenge infrastructure appeared.
- The separate external scanner dev workflow still lives under `scripts/run-ws01-scanner-dev.sh` and is only needed when you want to run that scanner itself.
