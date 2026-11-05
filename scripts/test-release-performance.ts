import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1',
  'scripts/lib/release-scheduler.test.ts', 'scripts/lib/release-receipts.test.ts', 'scripts/lib/release-shards.test.ts',
  'scripts/lib/deployed-image.test.mjs', 'apps/v2-dag-lambda/src/dev-scripts.test.ts',
  'scripts/lib/deployment-inputs.test.mjs', 'scripts/lib/scanner-artifact.test.ts',
  'scripts/release-preparation.test.ts', ...(process.argv.includes('--regressions') ? ['scripts/deploy-latency.test.ts',
  'scripts/lib/deployment-consumer-barrier.test.ts', 'scripts/lib/scanner-runtime-base.test.ts',
  'scripts/lib/scanner-image-provenance.test.ts', 'scripts/lib/scanner-configuration-scope.test.ts',
  'scripts/deployment-workflow-runs.test.ts', 'scripts/web-deploy-migration-order.test.ts',
  'scripts/web-deployment-skew-protection.test.ts', 'scripts/post-accept-form-release-gate.test.ts',
  'scripts/scan-release-regressions.test.ts'] : [])], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
