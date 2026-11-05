import type { Check } from '../predeploy';
import { receiptMatches, type ReleaseInputs } from './release-receipts';
import { aggregateShards, type ShardPlan, type ShardResult } from './release-shards';

export const requiredCiWorkflows = [
  '.github/workflows/no-scanner-ecs.yml', '.github/workflows/aws-infrastructure-checks.yml',
  '.github/workflows/accessibility-validation.yml', '.github/workflows/post-accept-form-lifecycle.yml',
  '.github/workflows/finding-calibration.yml', '.github/workflows/v2-regulatory-gold-corpus.yml',
];
export type CiRun = { id: number; path: string; head_sha: string; event: string; status: string; conclusion: string | null;
  updated_at: string; run_attempt: number; head_repository: { full_name: string }; html_url: string };

export function validateRequiredCi(inputs: ReleaseInputs, ciRuns: CiRun[], now = Date.now()) {
  return requiredCiWorkflows.map(workflow => {
    const latest = ciRuns.filter(run => run.path === workflow && run.head_sha === inputs.sha && run.head_repository?.full_name === 'ergoveritas1-alt/certscore.ai' && ['push', 'pull_request', 'workflow_dispatch'].includes(run.event)).sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
    const end = Date.parse(latest?.updated_at ?? '');
    if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success' || !Number.isFinite(end) || end > now || now - end > 24 * 60 * 60 * 1000) throw new Error(`Missing current successful CI: ${workflow}.`);
    return { workflow, id: latest.id, attempt: latest.run_attempt, url: latest.html_url };
  });
}

export function validatePreparation(checks: Check[], inputs: ReleaseInputs, receipts: unknown[], exportsFingerprint: string, ciRuns: CiRun[], now = Date.now()) {
  if (!inputs.clean) throw new Error('Preparation requires a clean committed source.');
  for (const check of checks) {
    const matches = receipts.filter(value => receiptMatches(value, { ...check, inputs }, now));
    if (!matches.length || (check.key === 'workspace-package-build' && !matches.some(value => value.outputsFingerprint === exportsFingerprint))) throw new Error(`Missing matching verification: ${check.key}.`);
  }
  return preparationSnapshot(checks, inputs, validateRequiredCi(inputs, ciRuns, now), 'full-receipts', now);
}

export function validatePartitionPreparation(checks: Check[], inputs: ReleaseInputs, execution: ShardPlan['execution'], plan: ShardPlan, results: ShardResult[], exportsFingerprint: string, ciRuns: CiRun[], now = Date.now()) {
  if (!inputs.clean || plan.sha !== inputs.sha || plan.sourceFingerprint !== inputs.fingerprint || JSON.stringify(plan.execution) !== JSON.stringify(execution)) throw new Error('Partition proof is from a different source or execution environment.');
  aggregateShards(plan, checks, results, now);
  if (!results.every(result => result.inputs.node === inputs.node && result.inputs.pnpm === inputs.pnpm && (result.key !== 'workspace-package-build' || result.outputsFingerprint === exportsFingerprint))) throw new Error('Partition toolchain or generated exports differ.');
  return preparationSnapshot(checks, inputs, validateRequiredCi(inputs, ciRuns, now), 'partitioned-verification', now);
}

export function preparationSnapshot(checks: Check[], inputs: ReleaseInputs, ci: ReturnType<typeof validateRequiredCi>, verification: 'full-receipts' | 'partitioned-verification', now = Date.now()) {
  return { version: 1, kind: 'release-preparation' as const, sha: inputs.sha, checks: checks.map(check => check.key), ci, verification,
    completedAt: new Date(now).toISOString(), note: 'Readiness snapshot only. Existing deployment preflight, required CI, exact-image migrations and stabilization remain mandatory.' };
}
