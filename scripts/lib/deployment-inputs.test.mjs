import assert from 'node:assert/strict';
import test from 'node:test';
import { operationalManifestOnlyChange, deploymentInputDecision, erasedTypeOnlyChange } from './deployment-inputs.mjs';
const old = 'export interface Options { label: string }; export const x = 1;';
const typeOnly = old.replace('label: string', 'label: string; count?: number');
const decision = (files, before = old, after = typeOnly, service = 'mcp') => deploymentInputDecision(service, files, async () => before, async () => after);
test('type-only equivalence retains runtime constants, import side effects and metadata conservatively', () => {
  assert.equal(erasedTypeOnlyChange('source.ts', old, typeOnly), true);
  assert.equal(erasedTypeOnlyChange('source.ts', old, old.replace('x = 1', 'x = 2')), false);
  assert.equal(erasedTypeOnlyChange('source.ts', 'import "one";', 'import "two";'), false);
  assert.equal(erasedTypeOnlyChange('source.ts', old, '@decorator class X {}'), false);
  assert.equal(erasedTypeOnlyChange('source.json', '{}', '{}'), false);
  assert.equal(erasedTypeOnlyChange('source.ts', old, undefined), false);
});
test('MCP skips positively unchanged dependency runtime but unknown input and dependencies deploy', async () => {
  assert.equal((await decision(['packages/certscore-api-contracts/src/example.ts'])).deploy, false);
  assert.equal((await decision(['docs/release.md', 'packages/shared/src/example.test.ts'])).deploy, false);
  assert.equal((await decision(['apps/web/app/page.tsx'], old, 'runtime changed')).deploy, false);
  for (const file of ['pnpm-lock.yaml', 'package.json', 'packages/shared/package.json', '.npmrc', 'patches/dependency.patch', 'unknown-input.xyz', 'packages/shared/src/registry.json']) {
    assert.equal((await decision([file])).deploy, true, file);
  }
  assert.equal((await decision(['packages/shared/src/example.ts'], old, old.replace('x = 1', 'x = 2'))).deploy, true);
  const missing = await deploymentInputDecision('mcp', ['packages/shared/src/missing.ts'], async () => { throw Error('missing'); }, async () => typeOnly);
  assert.equal(missing.deploy, true);
  await assert.rejects(decision([], old, old, 'unknown'));
});
test('different test-name filters or TypeScript configurations remain separate executions', async () => {
  const { deduplicateExecutions } = await import('./release-check-plan.ts');
  const check = (key, args) => ({ key, label: key, command: ['node', '--test', ...args, 'same.test.ts'] });
  const a = check('a', ['--test-name-pattern=one']), b = check('b', ['--test-name-pattern=two']);
  assert.equal(deduplicateExecutions([a, b]).length, 2);
  assert.equal(deduplicateExecutions([a, { ...a, key: 'duplicate' }]).length, 1);
  assert.throws(() => deduplicateExecutions([a, { ...b, key: 'a' }]), /Conflicting/);
  assert.equal(deduplicateExecutions([check('c', ['--tsconfig=one.json']), check('d', ['--tsconfig=two.json'])]).length, 2);
});

test('release/test script edits do not dispatch MCP when build and dependency inputs are unchanged', async () => {
  const before = JSON.stringify({ packageManager: 'pnpm@10.6.3', scripts: { build: 'turbo run build', 'test:old': 'old test' }, dependencies: { example: '1' } });
  const after = JSON.stringify({ packageManager: 'pnpm@10.6.3', scripts: { build: 'turbo run build', 'test:old': 'new test', 'deploy:web': 'release entry' }, dependencies: { example: '1' } });
  assert.equal(operationalManifestOnlyChange(before, after), true);
  assert.equal((await decision(['package.json'], before, after)).deploy, false);
  for (const changed of [after.replace('turbo run build', 'different build'), after.replace('pnpm@10.6.3', 'pnpm@11'), after.replace('"example":"1"', '"example":"2"'), '{invalid']) {
    assert.equal(operationalManifestOnlyChange(before, changed), false);
    assert.equal((await decision(['package.json'], before, changed)).deploy, true);
  }
});

test('manifest proof preserves unknown fields and condition ordering conservatively', () => {
  assert.equal(operationalManifestOnlyChange('{"scripts":true}', '{"scripts":true}'), false);
  assert.equal(operationalManifestOnlyChange('{"exports":{"import":"one","default":"two"}}', '{"exports":{"default":"two","import":"one"}}'), false);
});
