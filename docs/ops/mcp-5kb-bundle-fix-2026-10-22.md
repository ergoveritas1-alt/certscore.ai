# CertScore.ai MCP 5 KB bundle limit

The owner authorized fixing and deploying the minimum-bundle overflow exposed
during the Muse 1.0.2 verification. Two existing owned scans returned 5,539 and
5,480 structured bytes for `maxBytes=5000`. The final fallback reconstructed
empty summary/link envelopes and repeated content URLs without enforcing the
budget again after serialization.

The correction removes redundant metadata and duplicate instruction prose only
when that final result is still over budget. Canonical posture scores and their
complete coverage summaries, forms, accessibility data, core findings, source
identity, dates and execution location are not truncated or reinterpreted by
this correction. Omitted retrieval URLs are explicitly marked; the retained
report URL and same-scan MCP evidence reads remain available. Existing 8 KB and
larger results that already fit are unchanged.

A final size guard prevents irreducible typed cores from escaping the budget.
It returns a bounded non-retryable `response_budget_exceeded` tool error with
read-only recovery guidance. A larger budget is suggested only within the
existing transport ceiling; otherwise use report-evidence pages. It never
creates a scan, changes the stored result, invents score data, or automatically
retries. Byte counts use serialized UTF-8, including metadata's final byte count.

## Regression evidence

The retained public test1 score/accessibility/forms/transport packet is stored
as a sanitized metadata fixture. Tests add clearly synthetic finding rows.
The unchanged baseline returns 5,211 / 5,216 / 5,233 / 5,277 bytes for summary,
findings, evidence and full modes. The new regression requires every mode to
fit 5,000 bytes while preserving the entire posture packet and typed summaries,
the first finding and total count, report URL, input immutability and output
schema. Protocol tests exercise the same case and an irreducible core through
MCP, preserving the existing four read-only origin requests and report actions.
A recovery test follows a suggested larger budget for the same retained core.

## Release scope

Hosted MCP only, through `.github/workflows/mcp-aws-ecs-deploy.yml`. Baseline
image SHA is `d7b527abaec3d761662acc2e6948e36fa5317237` on task definition
`certscore-web-mcp:188`. Public web, scanners, database, capacity and the Muse
1.0.2 download do not require changes. Run the relevant MCP tests/typechecks and
change-aware gate, require a clean pushed commit, and reuse its exact-SHA
push-triggered AWS run. Require successful workflow, stable ECS, the exact
deployed image, and strict live 5,000-byte reads using existing scans.

## Cost

No extra origin read, capture, model call, retention, schedule or capacity.
The bounded additional JSON work is estimated below $0.01/month at 100,000
requests before the offset from reduced transfer. Existing provisioned service
capacity is unchanged; expected net recurring cost is unchanged or lower.
