#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Stages only. Never writes the installed bot, its database or its configuration.
const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] && path.resolve(process.argv[2]);
const out = process.argv[3] && path.resolve(process.argv[3]);
if (!source || !out || source === out || out.startsWith(source + path.sep)) {
  throw new Error('Usage: node stage-fixes.mjs <installed-bot-directory> <new-isolated-output-directory>');
}
if (fs.existsSync(out)) throw new Error('Output must be a new directory; existing work will not be overwritten.');
const hashes = JSON.parse(fs.readFileSync(path.join(here, 'source-hashes.json'), 'utf8'));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [name, expected] of Object.entries(hashes)) {
  if (sha(path.join(source, name)) !== expected.originalSha256) throw new Error(`Source drift: ${name}. Review new changes before staging.`);
}
fs.mkdirSync(out, { recursive: true });
for (const name of ['daemon.js', 'result_parser.js', 'result_parser.test.js', 'test.js',
  'dns_guard.js', 'dns_guard.test.js', 'backfill_results.mjs', 'package.json']) {
  fs.copyFileSync(path.join(source, name), path.join(out, name));
}
const result = spawnSync('patch', ['-p1', '--batch', '--forward', '-d', out, '-i', path.join(here, 'fixes.patch')], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`Patch failed: ${result.stderr || result.stdout}`);
for (const [name, expected] of Object.entries(hashes)) {
  if (sha(path.join(out, name)) !== expected.patchedSha256) throw new Error(`Patched hash mismatch: ${name}`);
}
fs.copyFileSync(path.join(here, 'result-handling.mjs'), path.join(out, 'result-handling.mjs'));
// Reuse installed packages for tests; this stages no dependency upgrade.
fs.symlinkSync(path.join(source, 'node_modules'), path.join(out, 'node_modules'), 'dir');
console.log(JSON.stringify({ staged: out, sourceUnchanged: true, networkRequests: 0 }, null, 2));
