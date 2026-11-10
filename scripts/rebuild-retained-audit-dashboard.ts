import {EVIDENCE_METRICS} from './lib/audit-progress-evidence';
import {extractExportRow} from './lib/audit-progress-export';
import {GPC_CORE_METRICS} from './lib/audit-progress-gpc';
import {applyPublicCmpEvidence,PUBLIC_CMP_CRITERIA} from './lib/audit-progress-export';
import {localDay,METRICS,type ProgressRow} from './lib/audit-progress';
import {makeContracts} from './lib/audit-progress-contracts';
import {progressEngine} from './lib/audit-progress-engine';
import {auditQuantityCsvMetrics,auditStateCsvMetrics} from './lib/audit-measure-catalog';
import snapshotLimits from './lib/audit-progress-snapshot-limits.json';
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
import { rebuildChoiceEvidence } from './lib/audit-progress-choice-verification';
import { CHOICE_METRICS, OPT_OUT_OUTCOME_METRIC_IDS } from './lib/audit-progress-choice';
import {applyRetainedReports,RETAINED_CLICK_ACTIVITY_KEYS} from './lib/audit-progress-retained-report';
import {applyRetainedOptOutExtracts} from './lib/audit-progress-opt-out';

const [previous, manifest, output, upgrade] = process.argv.slice(2);
if (!previous || !manifest || !output || (upgrade && !['--wire-current-cmp','--replay-opt-out-outcomes','--gpc-core-questions','--usable-choice-funnel','--choice-click-activity'].includes(upgrade))) {
  throw Error('Supply a sealed dashboard.json, a retained-only input manifest, and a fresh output directory');
}
const priorFile = realpathSync(previous);
const prior = path.dirname(priorFile);
const out = path.resolve(output);
assert.equal(path.basename(priorFile), 'dashboard.json');
const dataFiles = ['daily-metrics.csv', 'daily-volumes.csv', 'daily-findings.csv', 'metric-contracts.json', 'exclusions.json'];
const names = ['dashboard.json', 'dashboard.html', ...dataFiles];
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const bound = (name: string) => snapshotLimits[name as keyof typeof snapshotLimits] ?? 80_000_000;
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
if (upgrade==='--wire-current-cmp') {
  const currentDay=data.days.at(-1).date;
  const known=new Set(data.metrics.map((m:{id:string})=>m.id));
  data.metrics.push(...PUBLIC_CMP_CRITERIA.filter(m=>!known.has(m.id)));
  for(const row of data.rows as ProgressRow[]){
    if(!row.reportable||localDay(row.createdAt)!==currentDay)continue;
    for(const m of PUBLIC_CMP_CRITERIA)row.states[m.id]??='unavailable';
    const ref=row.refs.find(r=>r.role==='hash_verified_bot_archive_export');
    if(!ref)continue;
    const bytes=read(ref.file,6*1024*1024);
    assert.equal(sha(bytes),ref.sha256,'Current public CMP export hash mismatch');
    const report=JSON.parse(bytes.toString('utf8'));
    assert.equal(report.scanId,row.scanId,'Current public CMP export scan mismatch');
    applyPublicCmpEvidence(row,report);
  }
}
if(upgrade==='--replay-opt-out-outcomes'){
  const {rows}=rebuildChoiceEvidence(data);
  for(const [index,row] of (data.rows as ProgressRow[]).entries()){
    const replay=rows[index]!;
    assert.equal(replay.scanId,row.scanId);
    for(const id of OPT_OUT_OUTCOME_METRIC_IDS){
      delete row.states[id];delete row.metricSources?.[id];
      if(replay.states[id]===undefined)continue;
      row.states[id]=replay.states[id]!;
      (row.metricSources??={})[id]=replay.metricSources![id]!;
    }
  }
  const presence=CHOICE_METRICS.find(metric=>metric.id==='sealed.opt_out.presence')!;
  data.metrics=data.metrics.map((metric:{id:string})=>metric.id===presence.id?presence:metric);
}
if(upgrade==='--gpc-core-questions'){
  const known=new Set(data.metrics.map((m:{id:string})=>m.id));
  data.metrics.push(...GPC_CORE_METRICS.filter(m=>!known.has(m.id)));
  for(const row of data.rows as ProgressRow[]){
    if(!row.reportable)continue;
    for(const m of GPC_CORE_METRICS)row.states[m.id]='unavailable';
    const ref=row.refs.find(r=>r.role==='hash_verified_bot_archive_export');
    if(!ref)continue;
    const bytes=read(ref.file,6*1024*1024);
    assert.equal(sha(bytes),ref.sha256,'GPC question source hash');
    const extracted=extractExportRow(JSON.parse(bytes.toString('utf8')),ref);
    assert.equal(extracted.scanId,row.scanId);
    for(const m of GPC_CORE_METRICS){row.states[m.id]=extracted.states[m.id]??'unavailable';(row.metricSources??={})[m.id]=extracted.metricSources![m.id]!;}
  }
}
if(upgrade==='--usable-choice-funnel'){
  const definitions=new Map(METRICS.filter(m=>/^(click|registration)\.(accept|reject)$/.test(m.id)).map(m=>[m.id,m]));
  data.metrics=data.metrics.map((m:{id:string})=>definitions.get(m.id)??m);
}
if(upgrade==='--choice-click-activity'){
  const definitions=new Map(EVIDENCE_METRICS.filter(m=>/^detail\.(accept|reject)\.(verdict|activity_all)$/.test(m.id)).map(m=>[m.id,m]));
  data.metrics=data.metrics.map((m:{id:string})=>{
    const definition=definitions.get(m.id);
    definitions.delete(m.id);
    return definition??m;
  });
  data.metrics.push(...definitions.values());
}
const replay = structuredClone(data.rows) as ProgressRow[];
applyRetainedReports(replay, data.retainedReports);
applyRetainedOptOutExtracts(replay, inputs.sources);
for (const [index, row] of (data.rows as ProgressRow[]).entries()) {
  const coverage = replay[index]!.californiaRejectCoverage;
  if (coverage) row.californiaRejectCoverage = coverage;
  else delete row.californiaRejectCoverage;
  if(upgrade==='--choice-click-activity')for(const key of RETAINED_CLICK_ACTIVITY_KEYS){
    delete row.states[key];delete row.metricSources?.[key];
    const verified=replay[index]!;
    if(verified.states[key]!==undefined){
      row.states[key]=verified.states[key]!;
      (row.metricSources??={})[key]=verified.metricSources![key]!;
    }
  }
}
if(upgrade){
  data.days=progressEngine().aggregate(data,data.rows);
  data.contracts=makeContracts(data.metrics,data.quantities);
}
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
  if (name === 'daily-metrics.csv') {
    writeFileSync(file, progressEngine().stateCsv(data.days, auditStateCsvMetrics(data)), {flag: 'wx'});
  } else if (name === 'daily-volumes.csv') {
    writeFileSync(file, progressEngine().quantityCsv(data.days, auditQuantityCsvMetrics(data)), {flag: 'wx'});
  } else if(name==='metric-contracts.json'&&upgrade){
    writeFileSync(file,JSON.stringify(data.contracts,null,2)+'\n',{flag:'wx'});
  } else {
    copyFileSync(path.join(prior, name), file);
    const bytes = read(file, bound(name));
    assert.equal(sha(bytes), seal.files.find((entry: { file: string }) => entry.file === path.join(prior, name)).sha256);
  }
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
