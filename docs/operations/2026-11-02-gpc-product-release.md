# CertScore.ai GPC product release — November 2, 2026

The owner authorized preparation, publication and deployment when ready. The implementation and live AWS web baseline is `1f2869f49a3ea558c7510ba4321f8c6e0bfb0291`. The original working files and internal review outputs remain preserved; release preparation uses an isolated checkout.

The release adds canonical evidence-backed diagnosis and concrete investigation/correction/retest guidance, plus optional `certscore.gpc-cmp-state-comparison.v1` snapshots built from verified original worker bytes at the existing merge barrier. It preserves canonical findings, scoring, framework focus, historical interpretations, capture budgets and publication flow. A related normalization fix preserves absent cookie-setter proof instead of inferring it from a request initiator chain.

Public versions: SDK 0.2.23 and MCP 0.2.32. Publish npm packages and the Linux Homebrew artifact using checked-in tag workflows. Keep the advertised cask version at its existing verified release until the new Linux artifact exists and its reported digest can be checked. Update cask/formula/discovery references only from that CI-built release metadata.

Compatible API/web, validation and hosted MCP consumers must be deployed and verified before the new Lambda producer image. Use repository AWS workflows/helpers, the existing runtime bases and unchanged scanner configuration in eu-central-1, eu-west-1 and us-west-1. No infrastructure, dependency, worker-memory, flag, campaign, scan/action budget, database-schema or historical-report change is part of this release. The normal web workflow retains exact-image migration and forward-deploy safeguards; no separate database deployment is needed.

The combined conservative recurring feature estimate remains at most $0.90/month at 100,000 scans and 30-day retention. The cookie-attribution correction and local verification add $0 recurring cost. Normal release build/publication/deployment work uses existing workflows and bounded artifact retention; no new paid service or configured capacity is introduced. No measured Lambda saving or production population coverage is claimed.

Readiness requires the full local gate on the isolated source, deterministic fixture and PostgreSQL checks, standalone contract drift, packed-package consumer verification and required CI. Record exact commands/results, tags, published package integrity/provenance, workflow URLs, live web revision/runtime, ECS service health and scanner image/provenance parity separately. Keep all held diagnostics and campaigns inactive; use read-only production verification and the canonical owned verifier only.

Deployment and publication outcomes are recorded separately after the corresponding workflows complete. This preparation note is not a completion claim.
