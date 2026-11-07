/** Stage a local dashboard candidate at the existing cutoff. Inputs are immutable and already retained. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyMasterValueParity } from './lib/audit-master-parity';
import { verifyProgressPins } from './lib/audit-progress-pins';
import { renderProgressDashboard } from './lib/audit-progress-html';
import { COVERAGE_MATRIX } from './lib/audit-progress-coverage-matrix';
import { COVERAGE_MAP } from './lib/audit-progress-coverage';
import { OPT_OUT_INPUT_VERSION } from './lib/audit-progress-opt-out';

const [previous, manifest, output] = process.argv.slice(2);
if (!previous || !manifest || !output) {
  throw Error('Supply a sealed dashboard.json, a retained-only input manifest, and a fresh output directory');
}
const priorFile = realpathSync(previous);
const prior = path.dirname(priorFile);
const out = path.resolve(output);
assert.equal(path.basename(priorFile), 'dashboard.json');
const dataFiles = ['daily-metrics.csv', 'daily-volumes.csv', 'daily-findings.csv', 'metric-contracts.json', 'exclusions.json'];
const names = ['dashboard.json', 'dashboard.html', ...dataFiles];
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const bound = (name: string) => name === 'dashboard.json' ? 200_000_000 : name === 'dashboard.html' ? 100_000_000 : 80_000_000;
function read(file: string, maximum: number) {
  if (statSync(file).size > maximum) throw Error('Retained input exceeds its byte bound: ' + path.basename(file));
  const bytes = readFileSync(file);
  if (bytes.length > maximum) throw Error('Retained input exceeds its byte bound: ' + path.basename(file));
  return bytes;
}
const seal = JSON.parse(read(path.join(prior, 'dashboard-seal.json'), 100_000).toString('utf8'));
let data: any;
for (const name of names) {
  const file = path.join(prior, name);
  const entries = seal.files.filter((entry: { file: string }) => entry.file === file);
  assert.equal(entries.length, 1, 'Missing or duplicate prior seal entry: ' + name);
  const bytes = read(file, bound(name));
  assert.equal(bytes.length, entries[0].bytes, 'Prior seal size mismatch: ' + name);
  assert.equal(sha(bytes), entries[0].sha256, 'Prior seal hash mismatch: ' + name);
  if (name === 'dashboard.json') data = JSON.parse(bytes.toString('utf8'));
}

const inputs = JSON.parse(read(manifest, 80_000_000).toString('utf8'));
assert.equal(inputs.version, OPT_OUT_INPUT_VERSION);
assert.equal(inputs.retainedOnly, true);
assert.deepEqual(inputs.sources, data.optOutExtracts, 'Retained-only refresh must preserve all original control extracts');
assert.deepEqual(inputs.reportProjections, data.retainedReports, 'Retained-only refresh must preserve original report ancestry');
data.toolSources = verifyProgressPins();
// Recompute presentation contracts from the reviewed candidate source; retain all historical evidence bytes.
data.coverageMatrix = COVERAGE_MATRIX;
data.coverageMap = COVERAGE_MAP;
if (inputs.privacyFormReceipts?.length) data.privacyFormReceipts = inputs.privacyFormReceipts;
else delete data.privacyFormReceipts;
data.masterValueParity = verifyMasterValueParity(data);
data.generatedAtUtc = new Date().toISOString();
const json = Buffer.from(JSON.stringify(data) + '\n');
const html = Buffer.from(renderProgressDashboard(data));
if (json.length > bound('dashboard.json') || html.length > bound('dashboard.html')) {
  throw Error('Retained dashboard output exceeds the publication byte bound');
}
mkdirSync(out);
writeFileSync(path.join(out, 'dashboard.json'), json, { flag: 'wx' });
writeFileSync(path.join(out, 'dashboard.html'), html, { flag: 'wx' });
for (const name of dataFiles) {
  const file = path.join(out, name);
  copyFileSync(path.join(prior, name), file);
  const bytes = read(file, bound(name));
  assert.equal(sha(bytes), seal.files.find((entry: { file: string }) => entry.file === path.join(prior, name)).sha256);
}
const files = names.map(name => {
  const file = path.join(out, name), bytes = read(file, bound(name));
  return { file, bytes: bytes.length, sha256: sha(bytes) };
});
writeFileSync(path.join(out, 'dashboard-seal.json'), JSON.stringify({
  version: data.version, files, productionWrites: 0, newScans: 0, scheduledInvocationsAdded: 0,
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({
  status: 'candidate_ready', rows: data.rows.length,
  cutoff: data.windows.map((window: { end: string }) => window.end).sort().at(-1),
  matchedPrivacyFormReceipts: data.masterValueParity.p2Coverage.compactReceipts?.matched ?? 0,
  newQueries: 0, newAcquisition: 0,
}));
