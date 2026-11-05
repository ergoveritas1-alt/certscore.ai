import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseInputs, receiptMatches, writeCheckReceipt, type CheckReceipt } from './release-receipts';
const now = Date.now();
const expected = { key: 'unit', command: ['node', '--test', '--test-name-pattern=allow', 'unit.test.ts'], inputs: {
  sha: 'a'.repeat(40), fingerprint: 'b'.repeat(64), environment: 'c'.repeat(64), node: 'v22.22.1', pnpm: '10.6.3', clean: true } };
const receipt = (): CheckReceipt => ({ version: 1, ...structuredClone(expected), cwd: '.', startedAt: new Date(now - 1000).toISOString(), completedAt: new Date(now - 500).toISOString(), exitStatus: 0, durationMs: 500 });
test('successful exact clean SHA receipt reuses only identical inputs, configuration and toolchain', () => {
  assert.equal(receiptMatches(receipt(), expected, now), true);
  for (const key of ['sha', 'fingerprint', 'environment', 'node', 'pnpm'] as const) {
    const changed = receipt(); changed.inputs[key] = 'different'; assert.equal(receiptMatches(changed, expected, now), false, key);
  }
  for (const change of [{ exitStatus: 1 }, { command: ['node', '--test', 'unit.test.ts'] }, { version: 2 },
    { cwd: 'apps/web' }, { key: 'other' }, { durationMs: -1 }, { completedAt: 'invalid' },
    { completedAt: new Date(now + 1).toISOString() }, { startedAt: new Date(now).toISOString() }]) {
    assert.equal(receiptMatches({ ...receipt(), ...change }, expected, now), false, JSON.stringify(change));
  }
  assert.equal(receiptMatches(receipt(), expected, now + 25 * 3600000), false);
  assert.equal(receiptMatches({ ...receipt(), inputs: { ...expected.inputs, clean: false } }, expected, now), false);
  assert.equal(receiptMatches(receipt(), { ...expected, inputs: { ...expected.inputs, clean: false } }, now), false);
  for (const malformed of [null, {}, [], 'success']) assert.equal(receiptMatches(malformed, expected, now), false);
});
test('attempt receipts are immutable and retain failed attempts beside successes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'receipt-test-'));
  try {
    const first = await writeCheckReceipt(directory, { ...receipt(), exitStatus: 7 });
    const original = await readFile(first, 'utf8');
    const second = await writeCheckReceipt(directory, receipt());
    assert.notEqual(first, second); assert.equal(await readFile(first, 'utf8'), original);
    assert.equal((await readdir(directory)).length, 2);
    assert.equal(JSON.parse(original).exitStatus, 7);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('fingerprints invalidate changed tracked/untracked source and ignored runtime configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'receipt-inputs-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  try {
    git('init'); git('config', 'user.email', 'fixture@example.test'); git('config', 'user.name', 'Owned fixture');
    await writeFile(path.join(directory, '.gitignore'), '.env.local\n');
    await writeFile(path.join(directory, 'source.ts'), 'export const value = 1;');
    git('add', '.'); git('commit', '-m', 'owned fixture');
    const initial = await releaseInputs(directory);
    assert.equal(initial.clean, true);
    await writeFile(path.join(directory, 'source.ts'), 'export const value = 2;');
    const changed = await releaseInputs(directory);
    assert.equal(changed.sha, initial.sha); assert.equal(changed.clean, false); assert.notEqual(changed.fingerprint, initial.fingerprint);
    git('restore', 'source.ts');
    await writeFile(path.join(directory, 'new.ts'), 'export const added = 1;');
    assert.notEqual((await releaseInputs(directory)).fingerprint, initial.fingerprint);
    await rm(path.join(directory, 'new.ts'));
    await mkdir(path.join(directory, 'apps/web'), { recursive: true });
    await writeFile(path.join(directory, 'apps/web/.env.local'), 'OWNED_FIXTURE=private-local-value');
    const configured = await releaseInputs(directory);
    assert.equal(configured.clean, true); assert.notEqual(configured.fingerprint, initial.fingerprint);
    assert.doesNotMatch(JSON.stringify(configured), /private-local-value/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
