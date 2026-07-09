# Scanner Project Boundary

Production scanning runs only through the CertScore v2 DAG Lambda runtime in `WC01`. `WS01` is retained for local comparison and historical fixtures; it is not a production deployment target.

## Production scanner responsibilities
- `WC01/packages/certscore-scan-core` and the v2 DAG orchestration own production evidence capture
- the approved production targets are the v2 DAG Lambda functions in `eu-central-1`, `eu-west-1`, and `us-west-2`
- production scanner changes and deployments originate in `WC01`
- scanner ECS/Fargate services are prohibited

## Product repo responsibilities
- user-facing product web apps
- scan-triggering UI and product workflows
- organization, plan, and dashboard logic
- validation UI and non-scanner product surfaces
- compatibility shims needed while `WC01` shares the database contract with the scanner

## Current contract
- product apps persist scan requests as `scans.status = queued`
- the WC01 v2 DAG Lambda path executes production scans and returns retained artifacts
- Lambda phase, result handoff, and artifact manifests are the production runtime source of truth
- no WS01 ECS service should exist or be used as a fallback

## Current repo boundary
- production scanner observation and v2 DAG orchestration live in WC01's CertScore v2 packages
- WS01 may be consulted for retained fixtures and historical comparisons only
- normalized concern, concern policy, unified-finding assembly, and product-facing presentation remain WC01 responsibilities

## Follow-up tickets

### Ticket: Add `affiliate_disclosure_present`

Goal:
- add a positive transparency finding for sites that clearly expose an affiliate disclosure page or equivalent affiliate disclosure language

Scope:
- define the canonical evidence shape in `WS01`
- normalize and promote the resulting signal through the standard `WC01` concern pipeline
- validate on sites like `kbdlab.io` where an affiliate disclosure page is clearly reachable

Acceptance notes:
- should surface only when the disclosure path is clearly retained
- should avoid piggybacking on unrelated privacy-policy evidence

### Ticket: Revisit suppression for `bounded_key_page_discovery_unresolved`

Goal:
- reduce low-value internal noise on sites where key legal/support pages are already obviously reachable through stable footer or legal navigation

Scope:
- review whether this should be suppressed or downranked when the scan already retained clear paths to expected legal pages
- keep the decision in the normalized concern and concern policy flow rather than adding new raw-signal exceptions
- calibrate against `kbdlab.io` and similar sites that expose `Terms`, `Privacy`, and `Contact` paths clearly

Acceptance notes:
- should preserve reviewer value for genuine discovery failures
- should avoid surfacing or prioritizing this concern when retained evidence already shows the expected legal pages are reachable

This document records the Lambda-only production scanner boundary.
verification unless the WS01 scanner target variables are still being gathered.
