import { readFileSync } from 'node:fs';
import type { Check } from '../predeploy';

// Reviewed read-only unit groups. Everything else (browser, DB, typegen, build,
// shared fixture writers and unknown commands) holds the exclusive resource.
const PARALLEL_UNIT_KEYS = new Set(['mcp-release-asset-contract', 'deploy-latency-contracts',
  'scan-release-regression-review', 'assessment-highlights', 'accessibility-scoring', 'policy-source-witnesses']);
export function checkResources(check: Check) {
  return PARALLEL_UNIT_KEYS.has(check.key) ? { exclusive: false, memoryMb: 2048 } : { exclusive: true, memoryMb: 8192 };
}
export function deduplicateExecutions(checks: Check[]) {
  const byKey = new Map<string, string>(), seen = new Set<string>();
  return checks.filter(check => {
    const execution = JSON.stringify({ command: check.command, cwd: '.', environment: 'inherited', resources: checkResources(check) });
    if (byKey.has(check.key) && byKey.get(check.key) !== execution) throw new Error(`Conflicting configurations for check ${check.key}.`);
    byKey.set(check.key, execution);
    if (seen.has(execution)) return false;
    seen.add(execution); return true;
  });
}

export function inventoryChecks(checks: Check[]) {
  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  return checks.map(check => {
    let cwd = '.', script: string | undefined;
    if (check.command[0] === 'pnpm' && check.command[1] !== 'exec') {
      const filter = check.command.indexOf('--filter');
      if (filter === -1) script = root.scripts[check.command[1]!];
      else {
        const name = check.command[filter + 1];
        // Inventory all workspace scripts matching the selected package, without shell expansion.
        const dirs = ['apps/web', 'apps/validation-worker', 'apps/v2-dag-lambda', 'apps/mcp',
          'packages/certscore-scan-core', 'packages/db'];
        for (const dir of dirs) {
          const manifest = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
          if (manifest.name === name) { cwd = dir; script = manifest.scripts[check.command.at(-1)!]; }
        }
      }
    }
    const execution = script ?? check.command.join(' ');
    return { ...check, cwd, expandedScript: script ?? null,
      configuration: execution.match(/(?:--tsconfig(?:=|\s+)|-p\s+)([^\s]+)/g) ?? ['inherited TSX_TSCONFIG_PATH; package tsconfig'],
      filesGlobsAndFilters: execution.match(/[^\s]*\.(?:test|spec)\.(?:tsx?|mjs)|--test-(?:name-pattern|concurrency)(?:=|\s+)(?:'[^']*'|[^\s]+)/g) ?? [],
      ...checkResources(check), dependencies: check.key === 'workspace-package-build' ? [] : ['workspace-package-build'],
      reuse: 'successful exact clean SHA, inputs, environment, toolchain and command only; local does not replace CI' };
  });
}
