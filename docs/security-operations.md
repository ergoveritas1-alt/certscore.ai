# Security Operations

Owner: Product owner
Review cadence: Quarterly and after a material production incident
Effective date: 2026-08-23

This is the minimum operating procedure for production patching, supported
software, vulnerability scanning, and change approval in WC01. Evidence lives
in pull requests, GitHub Actions runs and their retained artifacts. Open
findings are tracked in
[`security-vulnerability-register.md`](./security-vulnerability-register.md).

## Patch management SLA

The product owner reviews Dependabot pull requests and vulnerability-scan
results at least weekly. Remediation time starts when CertScore is notified by
Dependabot, the quarterly scan, a vendor advisory, or another credible report.

| Severity | Production remediation SLA |
| --- | --- |
| Critical, known exploited, or active exploitation suspected | 72 hours |
| High | 14 calendar days |
| Medium | 30 calendar days |
| Low | 90 calendar days |

A patch may be replaced by a documented mitigation that removes exposure.
Anything not completed within the SLA needs a dated risk acceptance from the
product owner, the compensating control, and a new remediation date. Emergency
patches follow the same testing and change-record requirements as other
production changes.

Dependabot checks the pnpm workspace, GitHub Actions, and all production
Dockerfiles weekly. Merged updates flow through the existing repository-owned
AWS build and deployment workflows.

## Supported production software

Unsupported operating systems, language runtimes, databases, browsers, and
other production components must not be deployed. The quarterly review checks
vendor lifecycle dates and opens an upgrade issue no later than 90 days before
end of support. A discovered end-of-life component is treated as a High issue,
or Critical when it is exposed and has a known exploited vulnerability.

Current directly controlled runtime baseline:

| Component | Production baseline | Support evidence | Review/upgrade deadline |
| --- | --- | --- | --- |
| Node.js | 22 LTS | Supported through 2027-04-30 | Review by 2027-01-30 |
| Container OS | Debian 12 Bookworm LTS (`node:22-bookworm-slim`) | LTS through 2028-06-30 on amd64/arm64 | Review by 2028-04-01 |

AWS-managed service versions and the Chromium package installed in scanner
images are checked during the same quarterly review. The product owner records
the date, checked components, sources, result, and any follow-up issue in the
quarterly workflow run summary or a linked issue. The answer to "unsupported
OS/software in production" remains **No** only while this inventory and the
latest successful review show no unsupported component.

## Quarterly vulnerability scanning

`.github/workflows/quarterly-vulnerability-scan.yml` runs on the first day of
January, April, July, and October and can also be run manually. Trivy scans the
application dependency manifests and Terraform/Docker infrastructure
configuration for High and Critical vulnerabilities or misconfigurations. The
JSON result is retained for 90 days, including when the job fails, so the next
quarterly run refreshes the evidence before the prior artifact expires.

The product owner reviews every failed run, creates remediation issues, and
tracks them under the patch SLA. This is a lightweight repository and
infrastructure-as-code scan; it is not a penetration test or a claim that the
running public application received authenticated DAST.

## Single-owner production change control

WC01 currently has one repository owner and does not require a second-person
approval for production changes. Production code changes still use a pull
request so the proposed diff, automated checks, security impact,
migration/rollback implications, and any recurring-cost change remain in the
GitHub audit history. The product owner may author and merge that pull request
after the required checks pass.

`CODEOWNERS` is ownership-routing metadata only. Branch rulesets and production
deployment environments must not require an unavailable reviewer or Code Owner
approval while the repository has a single owner. Conversation-resolution,
force-push, deletion, and required-check protections may still be enabled
without adding a human approval requirement.

If a second maintainer is added later, independent review may be reintroduced
through an explicit policy update and matching GitHub repository and
environment settings. Until then, any questionnaire asking whether every
production change receives independent approval must be answered **No**.
