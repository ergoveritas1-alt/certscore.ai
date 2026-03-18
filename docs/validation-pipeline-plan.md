# Validation Pipeline Plan

This document reconstructs the original plan behind the validation pipeline from the shipped branch, runbook, and schema. It is intended to capture the design intent, not just the deployment steps.

Related docs:

- [Validation ops runbook](/Users/benmasek/WC01/docs/validation-ops-runbook.md)
- [Runtime validation](/Users/benmasek/WC01/docs/runtime-validation.md)
- [Validation schema migration](/Users/benmasek/WC01/packages/db/migrations/0045_validation_pipeline.sql)

## Goal

Build a dedicated validation lane that continuously checks public websites for privacy and legal issues, ranks the resulting findings, and uses an LLM to assess whether each finding is supported by the collected evidence.

The output should support two operator workflows:

- manual validation of a specific target on demand
- automatic sampling of Tranco-backed targets on a controlled cadence

## Non-goals

- replacing the main product scan pipeline
- making legal or compliance determinations
- fully autonomous operation without operator controls or circuit breakers
- using validation results as customer-facing reports without human interpretation

## Product Shape

The validation system should run as a separate operational lane:

- `apps/web` deployed with `APP_FLAVOR=validation_ops`
- separate validation worker and scheduler processes
- separate Redis for validation queues
- shared Supabase project initially

The public root page on the validation domain should expose crawler identity and contact information. The authenticated `/app` surface should be restricted to validation admins.

## Pipeline Design

Each validation run moves through three stages:

1. `collect`
   Create or attach a scan, run the existing crawler and artifact collection flow, and persist a `validation_runs` record.
2. `rank`
   Derive validation findings from the completed scan artifacts, de-duplicate them, and order them so the most important issues are reviewed first.
3. `verdict`
   Send each ranked finding plus its supporting scan evidence to the LLM and store a verdict of `supported`, `inconclusive`, or `not_supported` with confidence, rationale, and agreement score.

This is intentionally queue-backed rather than synchronous so that:

- runs survive process restarts
- failures can be retried by stage
- operators can observe run state over time
- manual and automatic triggers share the same execution path

## Operating Modes

The pipeline should support two modes:

- `manual`
  Operators add or select a target and explicitly start a run.
- `automatic`
  The scheduler selects the next eligible Tranco-backed target and creates a run only when the configured interval says it is due.

The scheduler must honor:

- global env kill switch: `VALIDATION_PIPELINE_ENABLED`
- admin pause/resume state from the UI
- cooldown and backoff windows on targets
- one active run per target at a time

## Target Selection Strategy

Automatic mode should sample from a ranked external target pool, initially Tranco.

Target management requirements:

- ingest targets from Tranco within a configurable rank band
- allow manual targets outside the sampled pool
- suppress denylisted domains
- apply cooldown after successful runs
- apply backoff after failures or hostile responses
- record audit events for target changes and scheduler actions

## Data Model

The pipeline needs first-class storage for:

- `validation_targets`
  inventory, eligibility state, rank metadata, cooldown, backoff, last outcome
- `validation_settings`
  pipeline enablement, run mode, interval, scheduler timestamps, operator note
- `validation_runs`
  one record per execution with status, trigger mode, counts, scan linkage, and error state
- `validation_run_findings`
  ranked findings derived from scan artifacts
- `validation_verdicts`
  LLM verdict, confidence, rationale, model, prompt version, evidence, agreement score
- `validation_audit_events`
  operator actions and scheduler or pipeline state changes

## Operator Surface

The validation UI should provide:

- overview page with mode, interval, pause/resume, and operator note
- target inventory with manual add, suppress, unsuppress, and clear-backoff actions
- recent run list
- run history page with filtering and paging
- run detail page showing automated finding, LLM verdict, rationale, and agreement score
- issue analytics page grouped by rule key

This is an operational console, not a marketing surface.

## Deployment Plan

1. Apply the validation schema migration.
2. Provision dedicated validation Redis.
3. Deploy the validation web flavor to its own domain.
4. Build and deploy the validation worker image.
5. Run separate worker and scheduler processes on the validation VM.
6. Run environment and runtime checks before first use.
7. Validate manual mode first, then automatic mode, then pause paths.

## Success Criteria

The first version is successful when:

- an admin can add a target and start a manual run
- the system creates a validation run and executes `collect -> rank -> verdict`
- findings and verdicts are visible in the UI
- automatic mode creates runs only when due
- pause paths block both manual and automatic execution as intended
- audit history records operator and scheduler changes

## Risks And Controls

- Queue or worker failure
  Mitigate with stage isolation, retries, and persisted run state.
- Runaway automation
  Mitigate with env kill switch, admin pause, cooldown, and backoff.
- Weak or misleading LLM judgments
  Mitigate by storing rationale, confidence, model, prompt version, and agreement score beside raw findings.
- Operational confusion with the main product
  Mitigate by deploying a separate app flavor and infrastructure lane.

## Deferred Or Secondary Work

- richer benchmark suites for accessibility and regression checks
- more sophisticated target sampling policy
- stronger observability around scheduler and queue health
- possible separation into a dedicated Supabase project if operational isolation becomes necessary
