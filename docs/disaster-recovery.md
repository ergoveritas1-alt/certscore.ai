# Basic Disaster Recovery and Backup/Restore Plan

## Purpose and scope

This is the minimum disaster-recovery (DR) plan for CertScore (`certscore.ai`).
It covers the WC01 production web services, PostgreSQL data, S3 report and scan
artifacts, secrets, deployment images, queues, and Terraform state. Scanner
runtime behavior owned by WS01 remains outside this plan, while the WC01-managed
AWS scanner infrastructure and retained artifacts are included.

This plan is intentionally manual and AWS-only. It does not promise automatic
multi-region failover.

## Recovery targets

These are initial operating targets, not customer guarantees:

- **RPO (acceptable data loss):** up to 24 hours, or the configured RDS
  point-in-time recovery window when that provides a better result.
- **RTO (time to restore basic service):** 8 hours for a database or application
  failure; 24 hours for a full AWS Region failure.
- **Recovery priority:** protect data first, then restore login and report reads,
  then scan submission and background processing.

## Systems and backups

| System | Backup or recovery source | Minimum check |
| --- | --- | --- |
| PostgreSQL (`wc01-postgres-enc`) | RDS automated backups, point-in-time recovery, and manual snapshots | Confirm automated backups are enabled, retention is at least 7 days, encryption is enabled, and a recent restore point exists. RDS is not managed by the checked-in Terraform, so an operator must verify this in AWS. |
| Reports and shared artifacts | Production S3 artifact bucket | Confirm encryption, public-access blocking, and applicable versioning/retention settings. Do not delete retained evidence as part of recovery. |
| Regional v2 scanner artifacts | Regional S3 buckets managed by `infra/aws/v2-dag-lambda` | Versioning is enabled; noncurrent versions expire after 90 days. Confirm the expected object and version exist before restoring. |
| Application and MCP services | Immutable Git-SHA images in ECR plus ECS task-definition history | Keep the last known-good image digest and task-definition revision available. |
| Infrastructure configuration | Git plus versioned, encrypted S3 Terraform state | Confirm each production stack uses its remote backend and that a prior state version can be read. Never overwrite state during an incident without first saving the current version. |
| Secrets | AWS Secrets Manager | Confirm required secret names/ARNs exist. Rotate exposed secrets; do not copy secret values into tickets, logs, or this repository. |
| Queued work | SQS queues and DLQs | Preserve messages where safe. Redrive only after database and consumers are healthy, to avoid duplicate or invalid processing. |

## Incident roles

- **Incident lead:** declares the incident, controls recovery order, and records
  decisions and timestamps.
- **AWS operator:** performs RDS, S3, ECS, SQS, Secrets Manager, and Terraform
  recovery actions.
- **Application verifier:** runs health checks and validates login, reports,
  artifact downloads, scan submission, and processing.
- **Product owner:** approves any recovery option that can add at least $1/month
  in recurring or usage cost, and approves acceptance of material data loss.

One person may fill multiple roles for a small incident, but the incident log
must name them.

## Recovery procedure

1. **Declare and contain.** Start an incident log with UTC time, affected
   services, last known-good time, and assigned roles. Stop deployments,
   migrations, destructive jobs, and queue redrives. If writes could corrupt
   more data, disable or scale down the affected writer while keeping evidence.
2. **Assess.** Check `https://certscore.ai/api/health`,
   `https://certscore.ai/api/health/database`, ECS service health, RDS events,
   S3 availability, CloudWatch alarms/logs, and queue/DLQ depth. Decide whether
   the failure is application-only, database, artifact storage, or Region-wide.
3. **Choose the restore point.** Record the latest safe database restore time,
   S3 object versions, Git SHA, ECS task definitions, and Terraform state
   versions. Prefer the newest verified point before the incident.
4. **Restore data before compute.** Follow the applicable procedure below. Do
   not overwrite the damaged database or S3 object until the restored copy has
   been verified.
5. **Restore services.** Deploy or select the last known-good immutable image,
   update runtime secrets/endpoints if a replacement database was created, and
   stabilize the ECS web, materializer, MCP, and required worker services.
6. **Verify before reopening writes.** Run health checks, authenticate with a
   test account, open an existing report, download an artifact, and confirm the
   expected database counts and newest safe records. Then submit one controlled
   scan and confirm canonical report materialization completes.
7. **Resume gradually.** Re-enable writes and workers. Inspect DLQs before a
   bounded redrive. Watch errors, latency, database connections, and queue age
   for at least 30 minutes.
8. **Close and review.** Record actual RPO/RTO, lost or replayed work, restored
   versions, verification evidence, and follow-up actions. Notify affected users
   when required by the incident's impact or policy.

## Database restore

1. In RDS, restore `wc01-postgres-enc` from the latest safe automated snapshot
   or point in time to a **new** DB instance.
2. Keep encryption, VPC/subnet placement, security groups, parameter settings,
   and PostgreSQL compatibility aligned with production.
3. From an approved VPC-connected task, verify connectivity, schema/migration
   state, key table counts, and a sample of recent organizations, scans,
   reports, and findings.
4. Update the `DATABASE_URL` secret to the replacement endpoint and deploy new
   ECS task revisions so all consumers receive it. Preserve the old instance
   until recovery is accepted.
5. Run only forward migrations that are required by the selected application
   image. Do not run repair or backfill scripts merely to make reports appear;
   canonical evidence-to-finding rules still apply.

If no acceptable restore point exists, stop and ask the product owner to accept
the documented data loss before initializing an empty database or importing a
partial copy.

## S3 object restore

1. Identify the exact bucket, key, checksum, and required version from the
   database pointer or retained manifest.
2. Retrieve or copy the known-good object version to a new recovery key first.
3. Verify size/checksum and the typed evidence contract before changing a
   canonical pointer or restoring the original key.
4. Never synthesize missing scanner evidence or findings. Missing or
   unverifiable evidence remains unknown, limited, or review-only under the
   canonical pipeline.

For a bucket or Region outage, restore only from an already available replica
or independently retained copy. This repository does not establish cross-region
replication, so cross-region artifact recovery must not be assumed.

## Application rollback

For application-only failures, use the checked-in AWS deployment workflow or
update the ECS service to the previous known-good task-definition revision and
immutable ECR image. Confirm the selected image is compatible with the current
database schema. Do not reverse database migrations by rewriting migration
history.

After rollback, confirm ECS stabilization, live Git SHA/runtime target, database
health, authenticated report access, and the affected API or MCP behavior.

## Region-wide outage

The baseline recovery is manual:

1. Confirm the outage is regional and not an account, DNS, credential, or
   application problem.
2. Inventory which backups and artifacts are actually accessible outside
   `us-west-1`.
3. Restore PostgreSQL and required S3 data in the approved AWS recovery Region,
   recreate infrastructure from reviewed Terraform and immutable images, and
   restore Secrets Manager values through an approved secure channel.
4. Validate the full service before changing DNS.
5. Change DNS only after the replacement ALB, TLS certificate, health checks,
   database, artifact access, and one controlled scan pass.

Because cross-region database and artifact replication are not established by
this repository, a Region-wide restore may exceed the targets above or be
limited by the available backups. Adding replication, AWS Backup plans, or warm
standby capacity requires a separate cost estimate and product-owner approval.

## Backup verification and DR test

- **Monthly:** confirm the newest RDS restore point, S3 protections, remote
  Terraform state/version access, required secrets, and last known-good ECR
  images/task definitions. Record the result without secret values.
- **Quarterly:** restore the database to an isolated non-production instance,
  verify schema and representative records, test one versioned S3 object
  recovery, and rehearse an ECS rollback. Delete temporary recovery resources
  after evidence is captured and the product owner confirms the test is done.
- **After material architecture changes:** update this document and run the
  affected restore check.

Do not run a restore test if its incremental paid-service usage is expected to
cost $1 or more without explicit product-owner approval. Disclose smaller cost
increases as required by the repository cost policy.

## Incident record checklist

Record: incident start/end, people and roles, cause, affected data and users,
last safe restore point, backup/object/image/task/state versions used, commands
or console actions, verification results, actual RPO/RTO, cost impact, user
communications, and assigned follow-ups.
