import ts from 'typescript';

const roots = {
  web: ['apps/web/', 'packages/certscore-api-contracts/', 'packages/certscore-contracts/', 'packages/certscore-mcp-auth/', 'packages/certscore-vendor-resolver/', 'packages/db/', 'packages/shared/', 'packages/ui/', 'packages/validation-shared/'],
  validation: ['apps/validation-worker/', 'apps/web/server/', 'apps/web/lib/', 'packages/'],
  scanners: ['apps/v2-dag-lambda/', 'packages/', 'config/iplocate/', 'scripts/local-v2-dag-lambda/'],
  mcp: ['apps/mcp/', 'packages/certscore-contracts/', 'packages/certscore-api-contracts/', 'packages/certscore-mcp-auth/', 'packages/certscore-mcp/', 'packages/certscore-sdk/', 'packages/shared/'],
};

/** Root release/test entry points are not image build commands. Preserve every
 * dependency, toolchain field, lifecycle/build script and unknown manifest field. */
export function operationalManifestOnlyChange(before, after) {
  const runtime = source => {
    const value = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unknown manifest');
    if (value.scripts !== undefined && (!value.scripts || typeof value.scripts !== 'object' || Array.isArray(value.scripts) || Object.values(value.scripts).some(command => typeof command !== 'string'))) throw new Error('Unknown script manifest');
    if (value.scripts) value.scripts = Object.fromEntries(Object.entries(value.scripts).filter(([key]) =>
      !/^(?:test:|preflight:|deploy:|ops:check:|ops:smoke:|codex:|local:)/.test(key)));
    return JSON.stringify(value);
  };
  try { return runtime(before) === runtime(after); } catch { return false; }
}

export function erasedTypeOnlyChange(file, before, after) {
  if (!/\.(?:ts|tsx)$/.test(file) || typeof before !== 'string' || typeof after !== 'string') return false;
  // Declaration files carry no runtime bytes. Compatibility checks remain mandatory.
  if (/\.d\.ts$/.test(file)) return true;
  // Avoid decorator metadata and import/elision ambiguities in this narrow proof.
  if (/@|\b(?:namespace|module|const\s+enum)\b/.test(before + after)) return false;
  const emit = source => {
    const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve,
      isolatedModules: true, removeComments: true, sourceMap: false, declaration: false,
    } });
    if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new Error('Unsupported TypeScript input');
    return result.outputText;
  };
  try { return emit(before) === emit(after); } catch { return false; }
}

/** Positive runtime-input equivalence only. Missing revisions/files, new formats,
 * dependency/build changes and unrecognized inputs conservatively deploy. */
export async function deploymentInputDecision(service, files, before, after) {
  if (!Object.hasOwn(roots, service)) throw new Error('Unknown deployment service');
  const reasons = [], ignored = [];
  for (const file of files) {
    if (/^(?:docs\/|AGENTS\.md$|README\.md$)/.test(file) || /\.(?:test|spec)\.(?:tsx?|mjs)$/.test(file)) { ignored.push([file, 'documentation/test; compatibility checks retained']); continue; }
    if (file === 'package.json') {
      try {
        if (operationalManifestOnlyChange(await before(file), await after(file))) { ignored.push([file, 'operational/test scripts only; build, dependencies and toolchain unchanged']); continue; }
      } catch { /* Missing or malformed manifest is never a skip proof. */ }
    }
    if (file.endsWith('/package.json') || ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json', 'turbo.json', '.dockerignore'].includes(file) || file.startsWith('patches/')) {
      reasons.push([file, 'dependency/build input']); continue;
    }
    if (/^(?:apps|packages)\//.test(file) && !roots[service].some(root => file.startsWith(root))) { ignored.push([file, 'outside runtime consumer closure']); continue; }
    // Other deploy workflow changes do not affect this service's artifact.
    if (file.startsWith('.github/workflows/') && !file.includes(`${service === 'scanners' ? 'v2-dag-lambda' : service}-aws`)) { ignored.push([file, 'different workflow; required CI retained']); continue; }
    if (/\.(?:ts|tsx)$/.test(file) && roots[service].some(root => file.startsWith(root))) {
      try {
        if (erasedTypeOnlyChange(file, await before(file), await after(file))) { ignored.push([file, 'identical emitted runtime; type compatibility required']); continue; }
      } catch { /* Added, removed, unavailable and unknown source inputs deploy. */ }
    }
    reasons.push([file, 'runtime input changed or equivalence unproven']);
  }
  return { service, deploy: reasons.length > 0, reasons, ignored };
}
