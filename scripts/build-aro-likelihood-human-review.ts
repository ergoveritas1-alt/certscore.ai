import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { runProdDbSqlOneoff } from "./lib/prod-db-psql-oneoff";

const execFileAsync = promisify(execFile);

export type AroReviewSourceRow = {
  scan_id: string;
  domain: string;
  created_at: string;
  completed_at: string | null;
  accept_observed: boolean | null;
  reject_observed: boolean | null;
  options_observed: boolean | null;
  consent_evidence_status: string | null;
  consent_assessment_status: string | null;
  consent_coverage_status: string | null;
  consent_surface_status: string | null;
  document_identity_status: string | null;
  assessment_source_hash: string | null;
  assessment_no_go: boolean | null;
  accept_reason_codes: string[] | null;
  reject_reason_codes: string[] | null;
  options_reason_codes: string[] | null;
  cmp_vendor_name: string | null;
  site_language_primary: string | null;
  scan_outcome: string | null;
  stop_reason_code: string | null;
  artifact_uri: string | null;
  artifact_sha256: string | null;
};

export type ReviewBucket =
  | "completed_negative"
  | "partial_inventory"
  | "missing_observation_binding"
  | "redirect_or_document_mismatch"
  | "hard_failure"
  | "mixed_or_other";

export type ReviewCase = AroReviewSourceRow & {
  bucket: ReviewBucket;
  normalizedDomain: string;
  screenshotPath: string | null;
  bundlePath: string | null;
  bundleVerified: boolean;
};

export type ReviewCohorts = {
  calibration: AroReviewSourceRow[];
  randomHoldout: AroReviewSourceRow[];
  challengeHoldout: AroReviewSourceRow[];
  pilot: AroReviewSourceRow[];
};

type Args = {
  days: number;
  outDir: string;
  calibrationSize: number;
  randomSize: number;
  challengeSize: number;
  pilotSize: number;
  pinnedScanIds: string[];
  source: string | null;
  fetchPilot: boolean;
  validateFile: string | null;
};

const ARO_FIELDS = ["accept", "reject", "options"] as const;
const REVIEW_STATES = ["present", "absent", "delayed", "unverifiable"] as const;
const FAILURE_REASONS = new Set([
  "assessment_blocked",
  "blank_or_unusable_page",
  "captcha_or_challenge",
  "loading_or_stalled",
  "navigation_transport_failure",
  "scan_no_go_assessment",
]);

function parseArgs(argv: string[]): Args {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const args: Args = {
    days: 7,
    outDir: `artifacts/aro-likelihood-human-review-${date}`,
    calibrationSize: 29,
    randomSize: 50,
    challengeSize: 20,
    pilotSize: 6,
    pinnedScanIds: [],
    source: null,
    fetchPilot: true,
    validateFile: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--days" && value) { args.days = Number(value); index += 1; }
    else if (arg === "--out-dir" && value) { args.outDir = value; index += 1; }
    else if (arg === "--calibration-size" && value) { args.calibrationSize = Number(value); index += 1; }
    else if (arg === "--random-size" && value) { args.randomSize = Number(value); index += 1; }
    else if (arg === "--challenge-size" && value) { args.challengeSize = Number(value); index += 1; }
    else if (arg === "--pilot-size" && value) { args.pilotSize = Number(value); index += 1; }
    else if (arg === "--pin" && value) { args.pinnedScanIds.push(value); index += 1; }
    else if (arg === "--source" && value) { args.source = value; index += 1; }
    else if (arg === "--validate" && value) { args.validateFile = value; index += 1; }
    else if (arg === "--no-fetch") args.fetchPilot = false;
  }
  for (const [name, value] of Object.entries({
    days: args.days,
    calibrationSize: args.calibrationSize,
    randomSize: args.randomSize,
    challengeSize: args.challengeSize,
    pilotSize: args.pilotSize,
  })) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  }
  return args;
}

function reasonCodes(row: AroReviewSourceRow) {
  return [...new Set([
    ...(row.accept_reason_codes ?? []),
    ...(row.reject_reason_codes ?? []),
    ...(row.options_reason_codes ?? []),
  ])];
}

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

export function classifyReviewBucket(row: AroReviewSourceRow): ReviewBucket {
  const reasons = reasonCodes(row);
  if (row.assessment_no_go || reasons.some((reason) => FAILURE_REASONS.has(reason))) return "hard_failure";
  if (row.document_identity_status === "mismatched" || reasons.some((reason) => /redirect|document_mismatch/.test(reason))) {
    return "redirect_or_document_mismatch";
  }
  if (row.document_identity_status !== "matched" || reasons.some((reason) => /observation_missing|identity_unverified/.test(reason))) {
    return "missing_observation_binding";
  }
  if (row.consent_coverage_status === "complete" && row.consent_surface_status === "not_observed") {
    return "completed_negative";
  }
  if (row.consent_coverage_status === "limited" || row.consent_coverage_status === "none" ||
      reasons.some((reason) => /partial|incomplete|timed_out|geometry/.test(reason))) {
    return "partial_inventory";
  }
  return "mixed_or_other";
}

function stableRank(row: AroReviewSourceRow, seed: string) {
  return createHash("sha256").update(`${seed}:${row.scan_id}`).digest("hex");
}

function uniqueLatestByDomain(rows: AroReviewSourceRow[]) {
  const selected = new Map<string, AroReviewSourceRow>();
  for (const row of [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at))) {
    const domain = normalizeDomain(row.domain);
    if (!selected.has(domain)) selected.set(domain, row);
  }
  return [...selected.values()];
}

function hasUnknown(row: AroReviewSourceRow) {
  return row.accept_observed === null || row.reject_observed === null || row.options_observed === null;
}

function takeDiverse(rows: AroReviewSourceRow[], limit: number, seed: string) {
  const buckets = new Map<ReviewBucket, AroReviewSourceRow[]>();
  for (const row of rows) {
    const bucket = classifyReviewBucket(row);
    const entries = buckets.get(bucket) ?? [];
    entries.push(row);
    buckets.set(bucket, entries);
  }
  for (const entries of buckets.values()) entries.sort((left, right) => stableRank(left, seed).localeCompare(stableRank(right, seed)));
  const orderedBuckets: ReviewBucket[] = [
    "completed_negative",
    "partial_inventory",
    "missing_observation_binding",
    "redirect_or_document_mismatch",
    "hard_failure",
    "mixed_or_other",
  ];
  const output: AroReviewSourceRow[] = [];
  while (output.length < limit) {
    let added = false;
    for (const bucket of orderedBuckets) {
      const next = buckets.get(bucket)?.shift();
      if (next) { output.push(next); added = true; }
      if (output.length >= limit) break;
    }
    if (!added) break;
  }
  return output;
}

export function selectReviewCohorts(
  rows: AroReviewSourceRow[],
  sizes: { calibration: number; random: number; challenge: number; pilot: number },
  pinnedScanIds: string[] = [],
): ReviewCohorts {
  const latest = uniqueLatestByDomain(rows);
  const pinned = pinnedScanIds.flatMap((scanId) => rows.find((row) => row.scan_id === scanId) ?? []);
  const pinnedDomains = new Set(pinned.map((row) => normalizeDomain(row.domain)));
  const unknownCandidates = latest.filter((row) => hasUnknown(row) && !pinnedDomains.has(normalizeDomain(row.domain)));
  const calibration = [...pinned, ...takeDiverse(unknownCandidates, Math.max(0, sizes.calibration - pinned.length), "calibration")]
    .slice(0, sizes.calibration);
  const usedScanIds = new Set(calibration.map((row) => row.scan_id));
  const usedDomains = new Set(calibration.map((row) => normalizeDomain(row.domain)));
  const remaining = latest.filter((row) => !usedScanIds.has(row.scan_id) && !usedDomains.has(normalizeDomain(row.domain)));
  const randomHoldout = [...remaining]
    .sort((left, right) => stableRank(left, "random-holdout-v1").localeCompare(stableRank(right, "random-holdout-v1")))
    .slice(0, sizes.random);
  const randomDomains = new Set(randomHoldout.map((row) => normalizeDomain(row.domain)));
  const challengeCandidates = remaining.filter((row) => !randomDomains.has(normalizeDomain(row.domain)) && hasUnknown(row));
  const challengeHoldout = takeDiverse(challengeCandidates, sizes.challenge, "challenge-holdout-v1");
  // Keep the first explicitly pinned regression case, then diversify the pilot.
  // Remaining pinned cases stay in the 29-case calibration cohort.
  const pinnedPilot = pinned.slice(0, Math.min(1, sizes.pilot));
  const pinnedPilotIds = new Set(pinnedPilot.map((row) => row.scan_id));
  const pilot = [
    ...pinnedPilot,
    ...takeDiverse(calibration.filter((row) => !pinnedPilotIds.has(row.scan_id)), Math.max(0, sizes.pilot - pinnedPilot.length), "pilot-v1"),
  ];
  return { calibration, randomHoldout, challengeHoldout, pilot };
}

function productionQuery(days: number) {
  return `select row_to_json(q)
from (
  select s.id::text as scan_id,
         d.hostname as domain,
         s.created_at::text,
         s.completed_at::text,
         ss.consent_accept_observed as accept_observed,
         ss.consent_reject_observed as reject_observed,
         ss.consent_options_observed as options_observed,
         ss.consent_evidence_status,
         ss.consent_assessment_status,
         ss.consent_coverage_status,
         ss.consent_surface_status,
         ss.consent_control_assessment #>> '{document,identityStatus}' as document_identity_status,
         ss.consent_control_assessment #>> '{provenance,sourceHash}' as assessment_source_hash,
         case when ss.consent_control_assessment #>> '{scan,noGo}' = 'true' then true
              when ss.consent_control_assessment #>> '{scan,noGo}' = 'false' then false else null end as assessment_no_go,
         ss.consent_control_assessment #> '{controls,accept,reasonCodes}' as accept_reason_codes,
         ss.consent_control_assessment #> '{controls,reject,reasonCodes}' as reject_reason_codes,
         ss.consent_control_assessment #> '{controls,options,reasonCodes}' as options_reason_codes,
         ss.cmp_vendor_name,
         ss.site_language_primary,
         ss.scan_outcome,
         ss.stop_reason_code,
         (select e.metadata_json #>> '{artifactPointers,scanArtifactUri}'
            from scan_events e
           where e.scan_id = s.id and e.event_type = 'v2_lambda_result.received'
           order by e.created_at desc limit 1) as artifact_uri,
         (select e.metadata_json #>> '{artifactMetadata,scanArtifactUri,sha256}'
            from scan_events e
           where e.scan_id = s.id and e.event_type = 'v2_lambda_result.received'
           order by e.created_at desc limit 1) as artifact_sha256
    from scans s
    join domains d on d.id = s.domain_id
    left join scan_snapshots ss on ss.scan_id = s.id
   where s.created_at >= now() - interval '${days} days'
     and s.status = 'completed'
   order by s.created_at desc
   limit 1500
) q`;
}

async function loadSource(args: Args) {
  if (args.source) {
    const value = JSON.parse(await readFile(args.source, "utf8")) as AroReviewSourceRow[] | {
      rows?: AroReviewSourceRow[];
      cohorts?: Partial<Record<"calibration" | "randomHoldout" | "challengeHoldout", AroReviewSourceRow[]>>;
    };
    if (Array.isArray(value)) return value;
    if (value.rows) return value.rows;
    return [
      ...(value.cohorts?.calibration ?? []),
      ...(value.cohorts?.randomHoldout ?? []),
      ...(value.cohorts?.challengeHoldout ?? []),
    ];
  }
  const output = await runProdDbSqlOneoff({
    marker: "ARO_LIKELIHOOD_REVIEW_SOURCE",
    readOnly: true,
    sql: productionQuery(args.days),
  });
  return output.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as AroReviewSourceRow);
}

function parseS3Uri(uri: string) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match?.[1] || !match[2]) throw new Error(`Invalid S3 artifact URI: ${uri}`);
  return { bucket: match[1], key: match[2] };
}

async function download(uri: string, destination: string) {
  await mkdir(path.dirname(destination), { recursive: true });
  await execFileAsync("aws", ["s3", "cp", uri, destination, "--only-show-errors"], { maxBuffer: 8 * 1024 * 1024 });
}

async function screenshotUri(artifactUri: string) {
  const { bucket, key } = parseS3Uri(artifactUri);
  const prefix = `${key.slice(0, key.lastIndexOf("/") + 1)}auxiliary/`;
  const { stdout } = await execFileAsync("aws", [
    "s3api", "list-objects-v2", "--bucket", bucket, "--prefix", prefix, "--output", "json",
  ], { maxBuffer: 16 * 1024 * 1024 });
  const payload = JSON.parse(stdout) as { Contents?: Array<{ Key?: string; Size?: number }> };
  const screenshot = (payload.Contents ?? [])
    .filter((item) => item.Key?.match(/screenshot.*\.(png|jpe?g)$/i) && (item.Size ?? 0) > 1000)
    .sort((left, right) => (right.Size ?? 0) - (left.Size ?? 0))[0];
  return screenshot?.Key ? `s3://${bucket}/${screenshot.Key}` : null;
}

async function materializeCase(row: AroReviewSourceRow, outDir: string): Promise<ReviewCase> {
  const caseDir = path.join(outDir, "evidence", row.scan_id);
  let bundlePath: string | null = null;
  let screenshotPath: string | null = null;
  let bundleVerified = false;
  if (row.artifact_uri) {
    bundlePath = path.join(caseDir, "CanonicalEvidenceBundle.json");
    await download(row.artifact_uri, bundlePath);
    const bytes = await readFile(bundlePath);
    const actual = createHash("sha256").update(bytes).digest("hex");
    bundleVerified = Boolean(row.artifact_sha256 && actual === row.artifact_sha256);
    const remoteScreenshot = await screenshotUri(row.artifact_uri);
    if (remoteScreenshot) {
      const extension = path.extname(parseS3Uri(remoteScreenshot).key) || ".png";
      const absoluteScreenshot = path.join(caseDir, `screenshot${extension}`);
      await download(remoteScreenshot, absoluteScreenshot);
      screenshotPath = path.relative(outDir, absoluteScreenshot);
    }
    bundlePath = path.relative(outDir, bundlePath);
  }
  return {
    ...row,
    bucket: classifyReviewBucket(row),
    normalizedDomain: normalizeDomain(row.domain),
    screenshotPath,
    bundlePath,
    bundleVerified,
  };
}

function escapeJsonForHtml(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function reviewHtml(cases: ReviewCase[], generatedAt: string) {
  const states = escapeJsonForHtml(REVIEW_STATES);
  const fields = escapeJsonForHtml(ARO_FIELDS);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>A/R/O human calibration pilot</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f4f6fa}body{margin:0}header{padding:18px 24px;background:#101828;color:white;display:flex;justify-content:space-between;gap:20px;align-items:center}main{max-width:1180px;margin:20px auto;padding:0 18px}.card{background:white;border:1px solid #d9deea;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px #10182812}.meta{padding:16px 18px;border-bottom:1px solid #e6e9f0}.meta h1{font-size:20px;margin:0 0 6px}.muted{color:#667085;font-size:13px}.grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(360px,.75fr);gap:0}.visual{min-height:460px;background:#eef1f6;display:flex;align-items:center;justify-content:center;border-right:1px solid #e6e9f0}.visual img{display:block;max-width:100%;max-height:680px}.empty{padding:40px;color:#667085;text-align:center}.review{padding:18px}.pass{border:1px solid #e1e5ed;border-radius:10px;padding:12px;margin-bottom:14px}.pass h2{font-size:15px;margin:0 0 4px}.row{display:grid;grid-template-columns:78px repeat(4,1fr);gap:6px;align-items:center;margin-top:9px}.row strong{text-transform:capitalize}.choice{border:1px solid #cfd5df;background:white;border-radius:8px;padding:8px 4px;cursor:pointer}.choice.selected{background:#155eef;color:white;border-color:#155eef}.live-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}input,textarea{box-sizing:border-box;width:100%;border:1px solid #cfd5df;border-radius:8px;padding:9px}textarea{min-height:56px}.actions{display:flex;gap:8px;align-items:center;margin-top:14px}.actions button,.actions a{border:0;border-radius:8px;padding:10px 14px;text-decoration:none;cursor:pointer}.actions button:disabled{cursor:not-allowed;opacity:.48}.primary{background:#155eef;color:white}.secondary{background:#e9edf5;color:#172033}.spacer{flex:1}.diagnostics{display:none;margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;font:12px ui-monospace,monospace;white-space:pre-wrap}.progress{font-size:13px}.complete{color:#067647;font-weight:700}@media(max-width:850px){.grid{grid-template-columns:1fr}.visual{border-right:0;border-bottom:1px solid #e6e9f0}.row{grid-template-columns:64px repeat(2,1fr)}}
</style></head><body>
<header><div><strong>A/R/O human calibration pilot</strong><div class="muted">Blind retained-evidence label, then separate live passive check</div></div><div id="overall" class="progress"></div></header>
<main><div id="app"></div></main>
<script>
const cases=${escapeJsonForHtml(cases)}; const states=${states}; const fields=${fields};
const key="certscore-aro-human-review-v1"; let index=0; let saved=JSON.parse(localStorage.getItem(key)||"{}");
function blank(c){return {reviewId:"aro-human:"+c.scan_id,scanId:c.scan_id,domain:c.domain,artifactSha256:c.artifact_sha256,assessmentSourceHash:c.assessment_source_hash,evidenceLabels:{},liveLabels:{},liveDelaySeconds:"",reviewRegion:"",reviewViewport:"",notes:"",reviewedAt:null,reviewer:""}}
function record(c){return saved[c.scan_id]||blank(c)} function persist(r){saved[r.scanId]=r;localStorage.setItem(key,JSON.stringify(saved))}
function decisionsComplete(r){return fields.every(f=>r.evidenceLabels[f]&&r.liveLabels[f])}
function complete(r){return decisionsComplete(r)&&r.reviewer.trim()&&r.reviewRegion.trim()}
function esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char])}
function choices(passName,field,r){return states.map(s=>'<button class="choice '+(r[passName][field]===s?'selected':'')+'" data-pass="'+passName+'" data-field="'+field+'" data-state="'+s+'">'+s+'</button>').join("")}
function pass(title,help,name,r){return '<div class="pass"><h2>'+title+'</h2><div class="muted">'+help+'</div>'+fields.map(f=>'<div class="row"><strong>'+f+'</strong>'+choices(name,f,r)+'</div>').join("")+'</div>'}
function render(){const c=cases[index],r=record(c),done=Object.values(saved).filter(complete).length;document.getElementById("overall").textContent=done+"/"+cases.length+" complete";
const visual=c.screenshotPath?'<img src="'+esc(c.screenshotPath)+'" alt="Retained pre-consent evidence for '+esc(c.domain)+'">':'<div class="empty">No usable retained screenshot.<br>Use “unverifiable” for the evidence pass.</div>';
const diagnostics=JSON.stringify({currentProjection:{accept:c.accept_observed,reject:c.reject_observed,options:c.options_observed},coverage:c.consent_coverage_status,surface:c.consent_surface_status,document:c.document_identity_status,reasons:{accept:c.accept_reason_codes,reject:c.reject_reason_codes,options:c.options_reason_codes}},null,2);
document.getElementById("app").innerHTML=[
'<div class="card"><div class="meta"><h1>'+(index+1)+'. '+esc(c.domain)+'</h1><div class="muted">Scan '+esc(c.scan_id)+' · '+esc(c.completed_at||c.created_at)+' · '+esc(c.bucket)+' · bundle '+(c.bundleVerified?'verified':'unverified')+'</div></div><div class="grid"><div class="visual">'+visual+'</div><div class="review">',
pass("Pass 1 — retained evidence","Label only what this retained frame establishes.","evidenceLabels",r),
pass("Pass 2 — fresh passive visit","Open the site in a clean private session. Do not click consent controls.","liveLabels",r),
'<div class="live-meta"><input id="reviewer" placeholder="Reviewer name" value="'+esc(r.reviewer)+'"><input id="region" placeholder="Region, e.g. EU-IR" value="'+esc(r.reviewRegion)+'"><input id="viewport" placeholder="Viewport, e.g. 1366×900" value="'+esc(r.reviewViewport)+'"><input id="delay" placeholder="Banner delay seconds" value="'+esc(r.liveDelaySeconds)+'"></div>',
'<textarea id="notes" placeholder="Optional rationale or page-change note">'+esc(r.notes)+'</textarea>',
'<div class="actions"><button class="secondary" id="prev">Previous</button><a class="secondary" href="https://'+esc(c.domain)+'" target="_blank" rel="noreferrer">Open live site</a><button class="secondary" id="diag" '+(decisionsComplete(r)?'':'disabled title="Finish both label passes first"')+'>Reveal diagnostics</button><span class="spacer"></span><button class="primary" id="next">'+(index===cases.length-1?'Finish':'Save & next')+'</button></div>',
'<div id="diagnostics" class="diagnostics">'+esc(diagnostics)+'</div></div></div></div><div class="actions"><span id="case-status" class="'+(complete(r)?'complete':'muted')+'">'+(complete(r)?'Complete':'Needs both passes, reviewer, and region')+'</span><span class="spacer"></span><button id="export" class="primary">Export review JSON</button></div>'
].join("");
document.querySelectorAll(".choice").forEach(b=>b.onclick=()=>{const rr=record(c);rr[b.dataset.pass][b.dataset.field]=b.dataset.state;persist(rr);render()});
for(const [id,field] of [["reviewer","reviewer"],["region","reviewRegion"],["viewport","reviewViewport"],["delay","liveDelaySeconds"],["notes","notes"]])document.getElementById(id).oninput=e=>{const rr=record(c);rr[field]=e.target.value;persist(rr)};
document.getElementById("prev").onclick=()=>{index=Math.max(0,index-1);render()};document.getElementById("next").onclick=()=>{const rr=record(c);rr.reviewedAt=new Date().toISOString();persist(rr);index=Math.min(cases.length-1,index+1);render()};document.getElementById("diag").onclick=()=>{if(decisionsComplete(record(c)))document.getElementById("diagnostics").style.display="block"};document.getElementById("export").onclick=()=>{const payload={artifactType:"aro_likelihood_human_review",artifactVersion:"1.0",generatedAt:new Date().toISOString(),packetGeneratedAt:${JSON.stringify(generatedAt)},labels:cases.map(record)};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));a.download="aro-human-review.json";a.click();URL.revokeObjectURL(a.href)} }
render();
</script></body></html>`;
}

export function validateHumanReview(value: unknown) {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { ok: false, errors: ["review must be an object"], completeLabels: 0 };
  const labels = (value as { labels?: unknown }).labels;
  if (!Array.isArray(labels) || labels.length === 0) return { ok: false, errors: ["review has no labels"], completeLabels: 0 };
  let completeLabels = 0;
  for (const [index, entry] of labels.entries()) {
    if (!entry || typeof entry !== "object") { errors.push(`label ${index + 1} is invalid`); continue; }
    const row = entry as Record<string, unknown>;
    for (const pass of ["evidenceLabels", "liveLabels"] as const) {
      const decisions = row[pass] as Record<string, unknown> | undefined;
      for (const field of ARO_FIELDS) {
        if (!REVIEW_STATES.includes(decisions?.[field] as typeof REVIEW_STATES[number])) errors.push(`${row.scanId ?? index}: invalid ${pass}.${field}`);
      }
    }
    if (typeof row.reviewer !== "string" || !row.reviewer.trim()) errors.push(`${row.scanId ?? index}: reviewer missing`);
    if (typeof row.reviewRegion !== "string" || !row.reviewRegion.trim()) errors.push(`${row.scanId ?? index}: review region missing`);
    if (!errors.some((error) => error.startsWith(`${row.scanId ?? index}:`))) completeLabels += 1;
  }
  return { ok: errors.length === 0, errors, completeLabels };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.validateFile) {
    const review = JSON.parse(await readFile(args.validateFile, "utf8")) as unknown;
    const result = validateHumanReview(review);
    console.log(JSON.stringify({ review: path.resolve(args.validateFile), ...result }, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const outDir = path.resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const source = await loadSource(args);
  await writeFile(path.join(outDir, "source-snapshot.json"), `${JSON.stringify(source, null, 2)}\n`, "utf8");
  const cohorts = selectReviewCohorts(source, {
    calibration: args.calibrationSize,
    random: args.randomSize,
    challenge: args.challengeSize,
    pilot: args.pilotSize,
  }, args.pinnedScanIds);
  const generatedAt = new Date().toISOString();
  const pilotCases = args.fetchPilot
    ? await Promise.all(cohorts.pilot.map((row) => materializeCase(row, outDir)))
    : cohorts.pilot.map((row) => ({
        ...row,
        bucket: classifyReviewBucket(row),
        normalizedDomain: normalizeDomain(row.domain),
        screenshotPath: null,
        bundlePath: null,
        bundleVerified: false,
      }));
  const manifest = {
    artifactType: "aro_likelihood_review_cohort",
    artifactVersion: "1.0",
    generatedAt,
    readOnly: true,
    sampling: {
      sourceWindowDays: args.days,
      sourceRows: source.length,
      calibration: "latest unknown scan per normalized domain, category-diverse, pinned cases first",
      randomHoldout: "deterministic hash-ranked unique domains excluded from calibration",
      challengeHoldout: "category-diverse unknown unique domains excluded from calibration and random holdout",
    },
    invariants: {
      queuesScans: false,
      changesProductionData: false,
      humanLabelsRemainSeparateFromScannerProjection: true,
      liveCheckMayOverwriteHistoricalEvidenceLabel: false,
    },
    cohorts,
  };
  await writeFile(path.join(outDir, "cohort-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(outDir, "pilot-review.html"), reviewHtml(pilotCases, generatedAt), "utf8");
  await writeFile(path.join(outDir, "pilot-cases.json"), `${JSON.stringify(pilotCases, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outDir,
    sourceRows: source.length,
    calibration: cohorts.calibration.length,
    randomHoldout: cohorts.randomHoldout.length,
    challengeHoldout: cohorts.challengeHoldout.length,
    pilot: pilotCases.length,
    pilotBuckets: Object.fromEntries([...new Set(pilotCases.map((row) => row.bucket))].map((bucket) => [bucket, pilotCases.filter((row) => row.bucket === bucket).length])),
    reviewPage: path.join(outDir, "pilot-review.html"),
    readOnly: true,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
