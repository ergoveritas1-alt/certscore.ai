import {retainedInputCoverage} from './audit-progress-input-coverage';
import {auditStateCsvMetrics,auditQuantityCsvMetrics,buildAuditMeasureView} from './audit-measure-catalog';
import {groupedProgressEntries,controlPresenceUnavailableLabel,measuredRateSeries,unavailableMetricDetail,latestVersionSample} from './audit-progress-table';
import {progressEngine} from './audit-progress-engine';
const quantitySubjects: Record<string, string> = {
 'accessibility.failed_rules': 'failed rules',
 'accessibility.review_rules': 'rules requiring manual review',
 'accessibility.affected_nodes': 'affected nodes',
 'inventory.cookies': 'distinct cookies',
 'inventory.vendors': 'recognized vendors',
 'inventory.unclassified_requests': 'unclassified external requests',
 'storage.unclassified': 'unclassified pre-consent storage records',
 'storage.proven_writes': 'timestamped pre-consent cookie writes',
 'storage.snapshot_only': 'late or initial cookie records',
 'forms.observed': 'observed forms',
 'form.events': 'form-destination events',
 'site.links_inspected': 'inspected links',
 'site.link_evidence': 'retained link evidence',
 'technology.detections': 'technology detections',
 'technology.matches': 'technology advisory matches',
 'graph.nodes': 'relationship graph nodes',
 'graph.edges': 'relationship graph edges',
 'accept.requests': 'requests after Accept',
 'accept.storage_writes': 'storage writes after Accept',
 'reject.requests': 'requests after Reject',
 'reject.storage_writes': 'storage writes after Reject',
 'gpc.paired.baseline.advertising_requests': 'advertising or marketing requests without GPC',
 'gpc.paired.gpc.advertising_requests': 'advertising or marketing requests with GPC',
 'gpc.paired.baseline.analytics_requests': 'analytics or replay requests without GPC',
 'gpc.paired.gpc.analytics_requests': 'analytics or replay requests with GPC',
 'gpc.paired.baseline.collection_sample': 'retained successful collection requests without GPC',
 'gpc.paired.gpc.collection_sample': 'retained successful collection requests with GPC',
 'gpc.paired.baseline.identified_sample': 'retained identifier or audience requests without GPC',
 'gpc.paired.gpc.identified_sample': 'retained identifier or audience requests with GPC',
 'gpc.session.advertising_collection': 'retained advertising collection during the full GPC visit',
 'gpc.session.classified_requests': 'retained classified requests during the full GPC visit',
 'gpc.session.supported_activity_requests': 'GPC requests with supported activity roles',
 'gpc.session.unresolved_activity_requests': 'GPC requests with unresolved activity roles',
 'gpc.session.processing_context_requests': 'GPC requests with processing declarations',
 'gpc.session.recipients': 'retained GPC advertising collection recipients',
};

/** Offline viewer. One aggregation implementation serves files, filters and downloads. */
export function renderProgressDashboard(data:any):string {
 const measureCatalog=buildAuditMeasureView(data);
 const tableEntries=measureCatalog.tableEntries;
 const stateValues=[...new Set<string>((data.rows??[]).flatMap((r:any)=>Object.values(r.states??{}) as string[]))],sourceValues=[...new Set<string>((data.rows??[]).flatMap((r:any)=>[r.defaultSource,...Object.values(r.metricSources??{})].filter(Boolean) as string[]))];
 const stateIndex=new Map(stateValues.map((v,i)=>[v,i])),sourceIndex=new Map(sourceValues.map((v,i)=>[v,i]));
 const fieldKeys:string[]=[],fieldIndex=new Map<string,number>();
 function encodeFields(fields:Record<string,string>,valueIndex:Map<string,number>){
  return Object.fromEntries(Object.entries(fields).map(([field,value])=>{
   let index=fieldIndex.get(field);
   if(index===undefined){index=fieldKeys.length;fieldKeys.push(field);fieldIndex.set(field,index);}
   return [index,valueIndex.get(value)];
  }));
 }
 const csvMetrics=auditStateCsvMetrics(data,measureCatalog.checklistAliases),csvQuantities=auditQuantityCsvMetrics(data);
 const browserData={...data,measureCatalog,tableEntries,csvMetrics,csvQuantities,quantitySubjects,fieldKeys,stateValues,sourceValues,days:(data.days??[]).map((d:any)=>({date:d.date,completeDay:d.completeDay,inventoryHours:d.inventoryHours})),rows:(data.rows??[]).map((r:any)=>{const {states,metricSources,metricLabels,defaultSource,...rest}=r;return {...rest,stateCodes:encodeFields(states,stateIndex),sourceCodes:encodeFields(metricSources??{},sourceIndex),defaultSourceCode:sourceIndex.get(defaultSource)};})};
 const safe=JSON.stringify(browserData).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CertScore.ai · Mac mini daily audit</title>
<style>
:root{color-scheme:light;--bg:#f7f8fb;--panel:#fff;--ink:#172238;--muted:#56647a;--line:#dce3ed;--accent:#6745ce}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:28px}h1{font-size:29px;margin:8px 0}h2{font-size:21px;margin:0 0 14px}h3{font-size:16px}p,.minor{color:var(--muted)}.minor{font-size:12px}.eyebrow{color:var(--accent);letter-spacing:.12em;text-transform:uppercase;font-size:12px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;margin:20px 0}.filters,.stats,.downloads{display:flex;gap:16px;flex-wrap:wrap;align-items:end}.filters label{display:grid;gap:5px;min-width:0}.stats{margin:20px 0}.stats strong{display:block;font-size:25px}.stats>div{min-width:150px}select,button{font:inherit;color:inherit;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:8px 10px;cursor:pointer}select{max-width:100%;min-width:0;width:100%}button:focus-visible,select:focus-visible{outline:3px solid #b0a0ed;outline-offset:2px}.table-scroll{max-height:80vh;overflow:auto;border:1px solid var(--line);border-radius:12px}table{border-collapse:separate;border-spacing:0;font-size:12px}th,td{padding:11px 13px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left;min-width:190px}thead th{position:sticky;top:0;z-index:3;background:#f0eef9}th:first-child,td:first-child{position:sticky;left:0;z-index:2;background:var(--panel);min-width:290px;max-width:340px}thead th:first-child{z-index:4}.group th{background:#eeebf7;font-size:14px;padding:10px 13px}.metric-name{display:flex;gap:8px;justify-content:space-between;align-items:start}.chart-button{color:var(--accent);padding:5px;flex:none;width:32px;height:32px}.value{font-size:17px;font-weight:650}.states{white-space:pre-line;margin:5px 0}.boundary{color:#765628}.series-list{max-width:280px;font-size:11px;overflow-wrap:anywhere}.series-list summary{cursor:pointer}.series-entry{margin:8px 0}.plot{width:100%;height:auto;display:block}.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:11px;overflow-wrap:anywhere}.legend span{max-width:100%}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.popover{position:fixed;z-index:10;width:580px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:white;border:1px solid #c7bce7;border-radius:16px;box-shadow:0 10px 35px #18244233;padding:18px}.popover[hidden]{display:none}.popover header{display:flex;justify-content:space-between;gap:10px;align-items:start}.popover h2{font-size:17px}.popover select{font-size:12px;width:100%;margin:5px 0}.contract{font-size:12px;overflow-wrap:anywhere}.contract dt{font-weight:650}.contract dd{margin:0 0 8px}dialog{max-width:min(900px,94vw);max-height:90vh;overflow:auto;border:1px solid var(--line);border-radius:14px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#5c3abc}#trend{max-height:350px}.chart-panel>summary{font-size:21px;font-weight:650;cursor:pointer}.chart-panel[open]>summary{margin-bottom:14px}footer{padding:15px 0 35px}.selected{background:#f8f5ff}@media(max-width:650px){main{padding:14px}.panel{padding:14px}h1{font-size:24px}.filters{gap:10px}.filters label{width:100%}th:first-child,td:first-child{min-width:190px;max-width:210px}th,td{min-width:175px;padding:9px}.stats{gap:10px}.stats>div{min-width:130px}.popover{padding:12px}.table-scroll{max-height:75vh}}
#coverageMap [data-coverage-group]{margin-top:24px}#coverageMap [data-coverage-group]>h3{background:#eeebf7;padding:12px;border-radius:8px}#coverageMap section{padding:12px 0;border-bottom:1px solid var(--line)}#coverageMap h4{font-size:16px;margin:4px 0 10px}#coverageMap p{margin:7px 0}#coverageMap [data-coverage-group="audit_only"]>h3{background:#eef2f6}

#coverageComparison>summary{font-size:21px;font-weight:650;cursor:pointer}#coverageComparison[open]>summary{margin-bottom:14px}.coverage-matrix-scroll{overflow:auto;max-height:72vh;border:1px solid var(--line);border-radius:12px;margin-top:16px}.coverage-matrix{width:100%;table-layout:fixed;min-width:1170px}.coverage-matrix th,.coverage-matrix td{width:22%;min-width:220px;max-width:none;overflow-wrap:anywhere}.coverage-matrix th:first-child{width:240px;min-width:240px;max-width:240px}.coverage-matrix thead th{top:0;z-index:5}.coverage-matrix thead th:first-child{z-index:6}.coverage-matrix tbody th{font-size:13px}.coverage-matrix .coverage-area th{position:static;background:#eeebf7;padding:12px;font-size:15px;max-width:none}.coverage-matrix .coverage-area.audit-area th{background:#eaf0f5}.coverage-matrix .area-note{display:block;font-weight:400;font-size:12px;margin-top:5px;max-width:950px}.coverage-matrix .item-name{padding-left:22px}.coverage-matrix p{font-size:12px;line-height:1.5;margin:8px 0 0}.coverage-badge{display:inline-block;border:1px solid #d2d9e5;border-radius:5px;padding:2px 6px;font-size:11px;font-weight:650;background:#f2f5f8}.coverage-badge[data-status="Detailed"],.coverage-badge[data-status="Derived"]{background:#e8f2ed;color:#245c43;border-color:#c0dacb}.coverage-badge[data-status="Summarized"],.coverage-badge[data-status="Referenced"]{background:#fff3dc;color:#755116;border-color:#ead5ad}.coverage-badge[data-status="Omitted"],.coverage-badge[data-status="Omitted"]{background:#f1f2f4;color:#606873}.catalog-subject{display:block;font-size:11px;color:var(--muted);font-weight:400;margin-bottom:6px}.catalog-definition{font-weight:400;font-size:11px;margin-top:7px}.catalog-definition summary{cursor:pointer}.catalog-definition code{overflow-wrap:anywhere}.coverage-condition{font-size:11px!important;color:#765628}.coverage-controls input{min-width:0;width:100%;font:inherit;max-width:100%;border:1px solid var(--line);border-radius:8px;padding:8px}.coverage-controls label{flex:1 1 200px}.coverage-controls select{width:100%}#coverageMatrixSummary{font-size:12px}.gap-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:14px 0}.gap-card{text-align:left;white-space:normal;line-height:1.5;background:#f7f8fc}.gap-card strong{display:block;font-size:17px}.gap-card span{display:block;font-size:12px}.value-legend{font-size:12px;line-height:1.7}.value-tag{display:inline-block;font-size:11px;padding:3px 6px;border-radius:4px;margin-top:6px}.value-tag[data-value="potential_overlap"],tr[data-value-review="potential_overlap"]>th{background:#fff1ca;color:#634500}.value-tag[data-value="low_standalone_value"],tr[data-value-review="low_standalone_value"]>th{background:#efe8fa;color:#51346e}.gap-review{font-size:11px;margin-top:10px;border-top:1px solid var(--line);padding-top:8px}.gap-review summary{cursor:pointer;font-weight:650}.gap-review[data-disposition="close"] summary{color:#174f7e}.normalization-tag{display:block;width:fit-content;font-size:11px;line-height:1.4;padding:4px 7px;border-radius:5px;margin-top:8px;border:1px solid #b8cde4;background:#eaf3fc;color:#234b73}.normalization-tag[data-decision="keep_distinct"]{background:#e8f3ec;border-color:#bddbc8;color:#22563a}.normalization-tag[data-decision="alias_candidate"]{background:#fff0c7;border-color:#e3c26b;color:#6f4a00}.normalization-tag[data-decision="move_metadata"]{background:#eef0f4;border-color:#cdd2dd;color:#4b5363}.normalization-tag[data-decision="retire_standalone"]{background:#fbe8e7;border-color:#e3b2b0;color:#883b37}.normalization-detail{font-size:11px;font-weight:400;margin-top:7px}.normalization-detail summary{cursor:pointer}.normalization-detail code{overflow-wrap:anywhere}.taxonomy-overview{padding:14px;background:#f5f8fc;border:1px solid #d3dfed;border-radius:10px;margin:14px 0}.taxonomy-overview p{font-size:13px}.taxonomy-counts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.taxonomy-counts button{white-space:normal;font-size:12px}.gap-priorities li{margin:12px 0}.gap-priorities p{margin:5px 0;font-size:13px}@media(max-width:650px){.coverage-matrix th:first-child{width:165px;min-width:165px;max-width:165px}.coverage-matrix{min-width:1070px}.coverage-matrix .item-name{padding-left:12px}.coverage-matrix-scroll{max-height:70vh}}
.gap-review[data-resolution="implemented_locally"]>summary{color:#245c43}.gap-review[data-resolution="blocked_missing_evidence"]>summary{color:#865b14}.gap-review[data-resolution="intentional_subset"]>summary{color:#606873}</style></head><body><main><div class="eyebrow">CertScore.ai · retained Mac mini evidence</div><h1>Daily progress by measure group</h1>
<details class="panel" id="coverageComparison"><summary>Evidence coverage comparison</summary><p>One canonical catalog, with four output views. Group by domain to explore the taxonomy, or switch to scan-report boxes to retain the existing layout mapping.</p><section class="taxonomy-overview" aria-label="Canonical item normalization review"><strong id="normalizationSummary"></strong><p>Logical master v2: record types with distinct fields and scoped dimensions. Historical producer and export payloads keep their original contracts. Every item below has a recommendation badge. Blue = normalize as a field; green = keep distinct; gray = metadata; amber = conditional alias; rose = retire the standalone catalog entry, not the evidence.</p><div id="normalizationCounts" class="taxonomy-counts"></div><button id="showProposedConcepts">View master record types</button> <button id="normalizationDownload">Download master catalog v2</button><details id="normalizationPlan"><summary>Source review and migration gates</summary><p id="normalizationBasis"></p><ol id="normalizationWorkflow"></ol><p id="normalizationDecisions"></p></details></section><section class="taxonomy-overview" aria-label="Retained value parity"><strong id="masterParitySummary"></strong><p id="masterParityScope"></p><button id="masterParityDownload">Download value mapping and parity</button><p>Counts below cover the entire retained cohort, independent of chart filters. Values use original source versions; missing views and incompatible groups are not matches.</p></section><p id="reportFormatPolicy" class="minor"></p><p id="fullEvidencePolicy" class="minor"></p><p id="mappingCoverageSummary" class="minor"></p><p id="p2ResolutionSummary" class="minor"></p><details id="catalogGuidance"><summary>Catalog decisions and holds</summary><div id="catalogGuidanceItems"></div></details><details class="minor"><summary>Output definitions and availability</summary><p id="coverageFileScope"></p><p>Representation: Detailed = item-level fields; Summarized = a subset or summary; Derived = a calculated measure or assessment; Referenced = links or receipt references; Omitted = no item representation in that view.</p><p>Per-scan availability is evaluated separately in the retained-value counts below. A represented item may still be unknown, not assessed, not retained, unsupported by its source version, invalid/unbound or explicitly not applicable. A negative observation or measured zero is a value, not missing evidence.</p><p id="catalogScope"></p></details><div id="coverageGapCards" class="gap-cards" aria-label="Missing items by output view"></div><p class="minor" id="coverageReviewBasis"></p><details id="coveragePriorities"><summary>Recommended order for closing gaps</summary><ol class="gap-priorities" id="coveragePriorityList"></ol></details><p class="value-legend"><span class="value-tag" data-value="potential_overlap">Amber · possible overlap</span> <span class="value-tag" data-value="low_standalone_value">Lavender · low standalone value</span> Review suggestions only. No items are proven worthless; preserve evidence and differing scopes.</p><div class="filters coverage-controls"><label>View to review<select id="coverageView"><option value="all">All four views</option><option value="report">1 · Scan report</option><option value="standard">2 · Standard JSON evidence</option><option value="full">3 · Full evidence file</option><option value="audit">4 · Daily audit coverage</option></select></label><label>Review filter<select id="coverageReview"><option value="omitted">Missing items (omitted)</option><option value="close_locally">Close locally</option><option value="implemented_locally">Implemented locally</option><option value="blocked_missing_evidence">Blocked by missing evidence</option><option value="intentional_subset">Intentional subset</option><option value="P1">P1 · close first</option><option value="P2">P2 · close next</option><option value="retain_omission">Intentional omissions</option><option value="review_later">P3 · review later</option><option value="related_only">Related measure only</option><option value="flagged">All value-review flags</option><option value="potential_overlap">Possible overlap</option><option value="low_standalone_value">Low standalone value</option><option value="all" selected>All catalog items</option></select></label><label>Group by<select id="coverageGrouping"><option value="domains">Canonical domains</option><option value="areas">Scan-report boxes</option><option value="concepts" selected>Master record types</option></select></label><label>Normalization<select id="normalizationFilter"><option value="all">Every recommendation</option><option value="retirement">Alias / retirement candidates</option></select></label><label>Area<select id="coverageArea"></select></label><label>Evidence type<select id="coverageKind"><option value="all">All types</option></select></label><label>Find an item<input id="coverageSearch" type="search" placeholder="e.g. terminal, CMP, forms" /></label></div><p id="coverageMatrixSummary"></p><button id="catalogDownload">Download evidence catalog JSON</button><p class="minor">On narrow screens, scroll the table horizontally; the item column stays visible. Audit supplements retain their original report-area mapping. Expand an item’s definition to inspect its stable ID and scope.</p><div class="coverage-matrix-scroll" tabindex="0" role="region" aria-label="Evidence item coverage comparison"><table id="coverageMatrix" class="coverage-matrix"><caption class="minor">Four-way coverage by evidence area and item</caption><thead><tr><th scope="col" id="coverageHierarchyHeader">Domain / subject / item</th><th scope="col">1 · Scan report<br><span class="minor">Web · PDF · DOCX</span></th><th scope="col">2 · Standard JSON evidence<br><span class="minor">SDK / Mac mini scan bot</span></th><th scope="col">3 · Full evidence file<br><span class="minor">Report-evidence JSON</span></th><th scope="col">4 · Daily audit coverage</th></tr></thead></table></div></details>
<div id="stats" class="stats"></div>
<div class="filters"><label>Region<select id="region"><option value="all">All regions</option></select></label><label>CMP provider<select id="cmp"><option value="all">All returned providers</option></select></label><label>Origin proof<select id="origin"><option value="all">All retained Mac mini rows</option><option value="verified">Independently verified original credential</option><option value="selection">Production ID selection only</option></select></label><label>Measure group<select id="group"><option value="all">All measure groups</option></select></label></div>
<details class="panel chart-panel" id="chartPanel"><summary><span id="trendTitle">Reject control presence</span></summary><div class="filters"><label>Metric<select id="metric"></select></label><label>State<select id="chartState"></select></label><label>Comparison source<select id="chartSource"><option value="all">Separate source/version series</option></select></label></div><svg class="plot" id="trend" role="img"></svg><div id="legend" class="legend"></div><p id="chartNote" class="minor"></p></details>
<section class="panel"><h2>Report signals and capture quality</h2><p class="minor" id="tableSummary"></p><div class="table-scroll"><table id="daily"></table></div></section>

<details class="panel"><summary>Evidence-box coverage map · additions and remaining gaps</summary><p>One entry per current CertScore.ai scan-report Detailed evidence box type, including conditional boxes. This maps section identity, not complete field coverage or visibility on every scan. Historical versions can differ. “Additions” describes accumulated audit coverage, not newly collected evidence in this refresh. Audit-only diagnostics are grouped separately.</p><div id="coverageMap"></div></details>
<details class="panel"><summary>Metric contracts and retained sources</summary><p>Open a metric graph to inspect its contract. Unavailable exports remain explicit. Production ID selection is separate from verification of detailed evidence.</p><button id="sources">Inspect sources and limitations</button><p><a href="metric-contracts.json">Download all metric contracts</a></p></details>
<details class="panel"><summary>Recorded issues and release watch</summary><div id="issues"></div></details>
<details class="panel"><summary>Audit input coverage</summary><p class="minor">These are supplemental full-report inputs supplied to this audit. Missing input does not mean a scanner failure; public observations remain usable. Original-bundle linkage is a subset of matched reports. Counts follow the region and origin filters.</p><p id="inputCoverageSummary" class="minor"></p><div class="table-scroll"><table id="inputCoverage"></table></div></details>
<footer><div class="downloads"><button id="csv">Download daily states</button><button id="quantityCsv">Download daily volumes</button><button id="findingCsv">Download canonical findings</button></div><p class="minor">Downloads use the current region/origin filters. Historical exports and production reports are unchanged.</p></footer>
<div id="chartPopover" class="popover" role="dialog" aria-modal="false" aria-labelledby="chartPopoverTitle" hidden><header><h2 id="chartPopoverTitle"></h2><button id="closeChartPopover" aria-label="Close graph">×</button></header><label>State<select id="popoverState"></select></label><label>Comparison source<select id="popoverSource"></select></label><div id="popoverGraph"></div><div id="popoverLegend" class="legend"></div><details><summary>Metric meaning and denominator</summary><dl id="contract" class="contract"></dl></details></div>
<dialog id="proof"><button id="closeProof">Close</button><h2>Retained sources and limitations</h2><div id="proofBody"></div></dialog></main>
<script id="dashboard-data" type="application/json">${safe}</script><script>
(()=>{const __name=(v)=>v;const engine=(${progressEngine.toString()})();const inputCoverage=(${retainedInputCoverage.toString()});const unavailableControlLabel=(${controlPresenceUnavailableLabel.toString()});const measuredSeries=(${measuredRateSeries.toString()});const unavailableDetail=(${unavailableMetricDetail.toString()});const latestSample=(${latestVersionSample.toString()});const data=JSON.parse(document.getElementById('dashboard-data').textContent),$=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),label=s=>String(s).replaceAll('_',' '),pct=n=>n===null||n===undefined?'—':(Number.isInteger(n)?String(n):n.toFixed(1))+'%',delta=n=>n===null||n===undefined?'—':(n>0?'+':'')+n.toFixed(1)+' pp',colors=['#6745ce','#167d76','#b56522','#ad4770','#3976b2','#68783a'];
for(const r of data.rows){r.states=Object.fromEntries(Object.entries(r.stateCodes).map(([k,i])=>[data.fieldKeys[k],data.stateValues[i]]));r.metricSources=Object.fromEntries(Object.entries(r.sourceCodes).map(([k,i])=>[data.fieldKeys[k],data.sourceValues[i]]));r.defaultSource=data.sourceValues[r.defaultSourceCode];delete r.stateCodes;delete r.sourceCodes;}
let selectedKind='metric',selectedMetric='control.reject',selectedState='__primary__',selectedSource='all',days=[],anchor=null,tableInitialized=false;const key=e=>e.kind+':'+e.id,entry=()=>data.measureCatalog.entries.find(e=>e.kind===selectedKind&&e.id===selectedMetric)||data.tableEntries[0];
for(const c of [...new Set(data.rows.map(r=>r.states.cmp_provider).filter(Boolean))].sort())$('cmp').add(new Option(label(c),c));for(const r of [...new Set(data.rows.map(r=>r.region))].sort())$('region').add(new Option(r,r));for(const g of [...new Set(data.tableEntries.map(e=>e.group))])$('group').add(new Option(g,g));for(const e of data.measureCatalog.entries)$('metric').add(new Option(e.group+' · '+e.label,key(e)));$('metric').value='metric:control.reject';
const currentRows=()=>data.rows.filter(r=>$('cmp').value==='all'||r.states.cmp_provider===$('cmp').value).filter(r=>$('region').value==='all'||r.region===$('region').value).filter(r=>$('origin').value==='all'||($('origin').value==='verified'?r.originProof==='original_credential_verified':r.originProof==='production_id_selection_only'));
const stat=(d,id,kind)=>kind==='quantity'?d.quantities[id]:kind==='finding'?d.findings[id]:d.metrics[id];
const countQuantity=e=>e.kind==='quantity'&&e.unit!=='ms'&&e.unit!=='milliseconds';
const quantitySubject=e=>data.quantitySubjects[e.id]??e.unit;
const quantityPercent=p=>p.measured&&p.nonzero!==null?100*p.nonzero/p.measured:null;
function options(){const e=entry(),all=days.map(d=>stat(d,e.id,e.kind));$('chartState').replaceChildren();if(e.kind==='metric'){if(e.success.length)$('chartState').add(new Option(e.id.startsWith('control.')?'Observed control presence':'Named numerator share','__primary__'));const states=[...new Set(all.flatMap(v=>Object.keys(v.counts)))].sort();for(const s of states)$('chartState').add(new Option(label(s),s));}else if(e.kind==='quantity'){if(countQuantity(e))$('chartState').add(new Option('Measured reports with '+quantitySubject(e),'__primary__'));$('chartState').add(new Option('Median per measured report',countQuantity(e)?'__median__':'__primary__'));}else $('chartState').add(new Option('Canonical finding prevalence','__primary__'));if(![...$('chartState').options].some(o=>o.value===selectedState))selectedState=$('chartState').options[0]?.value??'';$('chartState').value=selectedState;
const sources=[...new Set(all.flatMap(v=>Object.keys(v.series)))].sort();$('chartSource').replaceChildren(new Option('Separate source/version series','all'));for(const s of sources)$('chartSource').add(new Option(s,s));if(!sources.includes(selectedSource))selectedSource='all';$('chartSource').value=selectedSource;}
const svgNS='http://www.w3.org/2000/svg';function node(tag,attrs={},text){const n=document.createElementNS(svgNS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function draw(){const e=entry(),svg=$('trend'),quantityRate=countQuantity(e)&&selectedState==='__primary__',medianQuantity=e.kind==='quantity'&&!quantityRate;svg.replaceChildren();svg.setAttribute('viewBox','0 0 680 280');$('trendTitle').textContent=e.label+' · '+(quantityRate?'measured reports with '+quantitySubject(e):medianQuantity?'median '+e.unit:e.kind==='finding'?'canonical finding prevalence':selectedState==='__primary__'?e.id.startsWith('control.')?'observed presence':'named numerator share':label(selectedState)+' share');svg.setAttribute('aria-label',$('trendTitle').textContent);
const sources=[...new Set(days.flatMap(d=>Object.keys(stat(d,e.id,e.kind).series)))].filter(s=>selectedSource==='all'||s===selectedSource).sort(),series=sources.map(s=>({source:s,points:days.map(d=>{const p=stat(d,e.id,e.kind).series[s];if(!p)return null;const value=quantityRate?quantityPercent(p):medianQuantity?p.median:e.kind==='finding'?p.rate:selectedState==='__primary__'?p.rate:p.denominator&&(selectedState==='unavailable'||p.counts.unavailable!==p.denominator)?100*(p.counts[selectedState]??0)/p.denominator:null;return {...p,value};})})),maximum=medianQuantity?Math.max(1,...series.flatMap(s=>s.points.map(p=>p?.value??0))):100;
const l=50,t=18,w=600,h=205;for(const f of [0,.25,.5,.75,1]){const y=t+h*(1-f);svg.append(node('line',{x1:l,y1:y,x2:l+w,y2:y,stroke:'#dce3ed'}),node('text',{x:2,y:y+4,'font-size':12,fill:'#56647a'},medianQuantity?(maximum*f).toFixed(1):100*f+'%'));}
days.forEach((d,i)=>{if(i%Math.max(1,Math.ceil(days.length/6))===0||i===days.length-1)svg.append(node('text',{x:l+w*i/Math.max(1,days.length-1),y:255,'text-anchor':'middle','font-size':12,fill:'#56647a'},d.date.slice(5)+(d.completeDay?'':' *')));});
series.forEach((s,j)=>{let segment=[];const color=colors[j%colors.length],finish=()=>{if(segment.length>1)svg.append(node('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2,'data-source':s.source}));segment=[];};s.points.forEach((p,i)=>{if(p?.value===null||p?.value===undefined){finish();return;}const x=l+w*i/Math.max(1,days.length-1),y=t+h*(1-p.value/maximum);segment.push(x+','+y);const n=quantityRate?p.nonzero:medianQuantity?p.measured:e.kind==='finding'||selectedState==='__primary__'?p.numerator:p.counts[selectedState]??0,N=quantityRate?p.measured:medianQuantity?p.eligible:p.denominator,change=e.kind==='quantity'?p.delta:selectedState==='__primary__'||e.kind==='finding'?p.deltaPp:p.stateDeltaPp[selectedState],detail=days[i].date+' · '+s.source+' · '+n+'/'+N+' · '+(medianQuantity?p.value.toFixed(1)+' '+e.unit:pct(p.value))+(quantityRate?' of measured reports with '+quantitySubject(e):' · Δ '+(medianQuantity?change??'unavailable':delta(change)))+(days[i].completeDay?'':' · partial sample');const dot=node('circle',{cx:x,cy:y,r:4,fill:days[i].completeDay?color:'#fff',stroke:color,'stroke-width':2,tabindex:0,'aria-label':detail,'data-source':s.source});dot.append(node('title',{},detail));svg.append(dot);if(s.source.includes('unknown')||s.source.includes('unversioned')||s.source.includes('unavailable'))finish();});finish();});
$('legend').innerHTML=series.map((s,j)=>'<span><i class="dot" style="background:'+colors[j%colors.length]+'"></i>'+esc(s.source)+'</span>').join('');$('chartNote').textContent='Each line keeps its own source and schema. Missing values create gaps; unknown/unversioned sources remain isolated points. Percentages retain unresolved states in their stated population.';}
function headlineRateSource(v,latest,observedOutcome){
 // ID-only selection tracks attempts with no readable outcome. It should
 // never supply the compact observed-outcome headline.
 const groups=measuredSeries(v).filter(([source])=>!observedOutcome||!source.startsWith('retained_production_id_selection/'));
 return groups.find(([source])=>source===latest?.source)??groups[0];
}
function rateLines(v,latest,denominatorLabel,recordSource,compact,outcome){
 const selected=headlineRateSource(v,latest,compact&&outcome);
 if(!selected)return '';
 const [source,p]=selected;
 recordSource?.(source);
 const subset=v.source==='mixed_sources'?' in one source':'';
 const value='<div class="value">'+pct(p.rate)+(compact&&outcome?' observed':'')+'</div>';
 return value+(compact?'':'<div class="minor">'+p.numerator+'/'+p.denominator+' '+denominatorLabel+subset+' · '+delta(p.deltaPp)+'</div>');
}
// These headlines describe the eligible retained rows. Source-specific rates
// and state definitions still come from the audit engine.
const tableHeadlineStates={
 'execution.accept':['succeeded_with_confirmation','Confirmed'],
 'execution.reject':['succeeded_with_confirmation','Confirmed'],
 'click.accept':['completed','Completed'],
 'click.reject':['completed','Completed'],
 'gpc_finding':['no_finding_returned','No finding returned'],
 'sealed.gpc_finding':['observed','Observed'],
 'selection.status':['completed','Completed'],
 'detail.gpc.session_collection':['positive_retained','Collection retained'],
 'sealed.choice_evidence.paired_cmp':['available','Available'],
 'detail.gpc.session_request_coverage':['complete','Complete'],
 'detail.gpc.cmp_receipt':['received','Received'],
 'detail.gpc.early_zero_later_collection':['early_zero_full_visit_positive','Later collection retained'],
 'detail.gpc.response':['responsive','Responsive'],
 'detail.gpc.semantic_probe':['observed','Observed'],
 'detail.gpc.acknowledgment':['observed','Observed'],
 'detail.gpc.activity_comparison':['measured','Measured'],
 'detail.storage.classification':['classified_nonessential_observed','Non-essential storage observed'],
 'sealed.opt_out.coverage':['available','Available'],
 'sealed.opt_out.lane':['joined','Joined'],
 'sealed.opt_out.configured':['enabled','Enabled'],
 'sealed.opt_out.conditional_control':['observed','Observed'],
 'sealed.opt_out.legacy_eligible_control':['observed','Observed'],
 'sealed.opt_out.supported_route':['supported','Supported'],
 'sealed.opt_out.dispatch':['dispatch_recorded','Dispatch recorded'],
 'sealed.opt_out.actions':['action_recorded','Action recorded'],
 'sealed.opt_out.submission':['submitted','Submitted'],
 'sealed.opt_out.registration':['confirmed','Confirmed'],
 'sealed.opt_out.action_completion':['completed','Completed'],
 'sealed.opt_out.choice_confirmation':['confirmed_terminal','Terminal confirmation'],
 'sealed.opt_out.post_confirmation_observation':['complete','Complete'],
 'sealed.opt_out.capture':['complete','Complete'],
 'sealed.opt_out.observation':['complete','Complete'],
 'sealed.opt_out.policy_methods':['methods_retained','Methods retained'],
 'sealed.opt_out.packet':['retained','Packet retained'],
 'sealed.opt_out.recipe':['selected','Selected'],
 'sealed.opt_out.presence':['observed','Observed'],
 'sealed.opt_out.findings_coverage':['available','Available'],
};
const checklistSignalStates={
 consent_browsing_as_consent:['potential_gap','gap_observed'],
 consent_optional_defaults_on:['potential_gap','gap_observed'],
 outdated_transfer_framework_reference:['partial_concern','review_signal'],
 device_identification_fingerprinting_signal_observed:['partial_concern','review_signal'],
 embedded_content_pre_consent:['partial_concern','review_signal'],
 post_reject_tracking_reduction:['partial_concern','review_signal'],
 pre_consent_cookies_storage:['partial_concern','review_signal'],
 pre_consent_third_party_tracking:['partial_concern','review_signal'],
 session_replay_fingerprinting_review:['partial_concern','review_signal'],
 social_media_embed_pre_consent:['partial_concern','review_signal'],
 third_party_iframe_pre_consent:['potential_gap','gap_observed'],
};
function tableStateHeadline(e,v){
 if(v&&Object.hasOwn(optOutOutcomes,e.id)){
  const observed=[...optOutOutcomes[e.id],['not_dispatched','Not dispatched'],['excluded_by_profile','Excluded by profile']].find(([state])=>v.counts[state]>0);
  if(observed)return observed;
 }
 const id=e.id.replace(/^sealed\\.(?=execution\\.|click\\.)/,'');
 if(Object.hasOwn(tableHeadlineStates,id))return tableHeadlineStates[id];
 if(e.success.length)return null;
 const check=e.id.match(/^(sealed\\.)?(checklist|verdict)\\.(.+)$/);
 if(check){
  const [,sealed,kind,id]=check;
  const signal=Object.hasOwn(checklistSignalStates,id)?checklistSignalStates[id]:null;
  const state=signal?(kind==='verdict'?signal[1]:sealed?'observed':signal[0]):'observed';
  return [state,label(state).replace(/^./,c=>c.toUpperCase())];
 }
 if(e.id.startsWith('sealed.choice_finding.'))return ['surfaced','Surfaced'];
 if(e.id.startsWith('sealed.priority_evidence.'))return ['included','Included'];
 if(/^(?:detail\\.gpc\\.(?:paired_(?:baseline|gpc)_)?|sealed\\.choice_evidence\\.paired_(?:baseline|gpc)_)(?:sale|sharing)$/.test(e.id))return ['opted_out','Opted out'];
 return [null,/^(?:sealed\\.)?cmp_provider$/.test(e.id)?'Identified':'Status returned'];
}
function tableStateCount(v,state){
 return state?(v.counts[state]??0):Object.entries(v.counts).reduce((n,[k,count])=>
  k==='unavailable'||k==='unknown'?n:n+count,0);
}
function stateRows(v,e,compact,heroState){
 if(!v.denominator||!Object.keys(v.counts).length)return '';
 if(!compact)return '<div class="states">'+esc(Object.entries(v.counts).map(([s,n])=>label(s)+': '+n+'/'+v.denominator).join('\\n'))+'</div>';
 const outcomeLabels={usable_limited:'limited',usable_complete:'complete',export_unavailable:'unavailable'};
 const order=e.id==='outcome'?Object.keys(outcomeLabels):['observed','not_observed','unknown','unavailable'];
 const states=[...new Set([...order,...Object.keys(v.counts)])].filter(s=>s!==heroState&&Object.hasOwn(v.counts,s)&&
  (e.id!=='outcome'||Object.hasOwn(outcomeLabels,s)));
 if(!states.length)return '';
 return '<div class="states minor state-percentages">'+states.map(s=>'<div data-state="'+esc(s)+'">'+esc(e.id==='outcome'?outcomeLabels[s]:label(s))+': '+pct(100*v.counts[s]/v.denominator)+'</div>').join('')+'</div>';
}
const optOutOutcomes={
 'sealed.opt_out.action_completion':[['completed','Completed'],['not_completed','Not completed']],
 'sealed.opt_out.choice_confirmation':[['confirmed_terminal','Terminal confirmation'],['confirmed_initial','Initial confirmation'],['unconfirmed','Unconfirmed'],['not_attempted','Confirmation not attempted']],
 'sealed.opt_out.post_confirmation_observation':[['complete','Complete'],['limited','Limited'],['not_measured','Not measured']],
};
const dispatchDependent=new Set(['confirmation_basis',
 'lane','lane_stop','recipe','actions','submission','registration','capture','observation','stop'].map(id=>'sealed.opt_out.'+id));
function noDispatch(day){
 const {counts,denominator}=day.metrics['sealed.opt_out.dispatch']??{counts:{},denominator:0};
 return denominator>0&&(counts.conditional_no_dispatch_recorded??0)+(counts.excluded_by_profile??0)===denominator;
}
function cell(v,e,recordSource,compact=false,hero=null,notDispatched=false){
 const headline=(title,detail='')=>'<div class="value">'+esc(title)+'</div>'+(!compact&&detail?'<div class="states">'+esc(detail)+'</div>':'');
 const latest=latestSample(v);
 if(e.kind==='quantity'){
  if(v.eligible===0)return headline('No eligible data');
  if(v.measured===0)return headline('Unavailable',v.eligible+' eligible · '+(e.id.startsWith('gpc.')?'No verified GPC quantity was retained.':'No quantity was retained for this measure.'));
  const volumes='<div class="minor">Total '+(v.total===null?'—':v.total.toLocaleString()+' '+esc(e.unit))+
   ' · Median '+(v.median===null?'—':v.median.toFixed(1))+' · Δ median '+(v.delta===null?'—':v.delta.toFixed(1))+'</div>';
  const coverage='<div class="minor">'+v.measured+'/'+v.eligible+' measured · '+v.missing+' unavailable</div>';
  if(countQuantity(e)){
   const groups=Object.entries(v.series??{}).filter(([,part])=>part.measured>0);
   const singleSource=v.source==='mixed_sources'&&groups.length===1?groups[0]:null;
   if(singleSource)recordSource?.(singleSource[0]);
   const measured=singleSource?.[1]??v;
   const rate=quantityPercent(measured);
   const title=rate===null?'Separate measurement groups':pct(rate)+' with '+quantitySubject(e);
   const basis=rate===null?'':measured.nonzero+'/'+measured.measured+' measured reports'+(singleSource?' in one source':'');
   return headline(title)+(singleSource?'<div class="minor">One measured source</div>':'')+coverage+(compact?'':'<div class="minor">'+basis+'</div>'+volumes);
  }
  return headline(v.median===null?'Separate measurement groups':v.median.toFixed(1)+' '+e.unit)+coverage+(compact?'':volumes);
 }
 if(e.kind==='finding'){
  if(v.eligible===0)return headline('No eligible data');
  const limits=v.unavailable+' unavailable/incomplete · '+v.incompletePositives+' retained positives outside denominator';
  if(v.denominator===0)return headline('No complete inventories',limits);
  const rate=rateLines(v,latest,'complete inventories',recordSource,compact,false);
  return (rate||headline(pct(v.rate),v.numerator+'/'+v.denominator+' complete inventories · '+delta(v.deltaPp)))+
   (compact?'':'<div class="states">'+esc(limits)+'<br>Top '+(v.top===null?'unknown':v.top)+'</div>');
 }
 if(v.denominator===0)return headline('No eligible data');
 if(unavailableControlLabel(e.id,v))return headline('Not exported',v.denominator+' eligible · public export omits this field');
 if(e.id==='sealed.cmp_dispatch'&&v.counts.intentionally_omitted===v.denominator)return headline('Omitted by scan profile',v.denominator+' scans · no inventory worker scheduled');
 if(v.counts.unavailable===v.denominator&&notDispatched&&dispatchDependent.has(e.id))return headline('No dispatch recorded');
 if(v.counts.unavailable===v.denominator)return headline('Unavailable',v.denominator+' eligible · '+unavailableDetail(e.id));
 if(v.counts.unknown>0&&Object.keys(v.counts).every(k=>['unknown','unavailable'].includes(k)))return headline('Unknown',v.counts.unknown+' unresolved · '+(v.counts.unavailable??0)+' unavailable')+(compact?stateRows(v,e,true):'');
 if(hero){
  const [state,title]=hero;
  return headline(title+': '+pct(100*tableStateCount(v,state)/v.denominator))+stateRows(v,e,true,state);
 }
 if(e.id.startsWith('customer_cmp_check.')&&v.counts.not_applicable===v.denominator)return headline('Not applicable');
 const unassessed=(e.id.startsWith('sealed.cmp_check.')||e.id.startsWith('customer_cmp_check.'))&&Object.keys(v.counts).every(k=>['not_assessed','incomplete','partially_assessed','unavailable'].includes(k));
 const rate=unassessed?'':rateLines(v,latest,'eligible',recordSource,compact,e.id==='outcome');
 const body=unassessed?headline(v.counts.incomplete||v.counts.partially_assessed?'Partial assessment':'Not assessed'):
  rate||(!e.success.length?(compact?'':v.denominator+' eligible'):v.rate===null?headline('Rate unavailable'):
   compact&&e.id==='outcome'&&v.source.startsWith('retained_production_id_selection/')?headline('No detailed exports'):
   headline(pct(v.rate)+(compact&&e.id==='outcome'?' observed':''),v.numerator+'/'+v.denominator+' · '+delta(v.deltaPp)));
 return body+stateRows(v,e,compact);
}
function supportingDetails(day,entry){
 if(!entry.details?.length)return '';
 return '<details class="series-list supporting-evidence"><summary>Supporting evidence ('+entry.details.length+')</summary>'+
  entry.details.map(detail=>'<div class="series-entry" data-supporting-id="'+esc(detail.id)+'"><strong>'+esc(detail.label)+'</strong>'+
   cell(stat(day,detail.id,detail.kind),detail,undefined,true,detail.kind==='metric'?tableStateHeadline(detail,stat(day,detail.id,detail.kind)):null,noDispatch(day))+
   '<button class="supporting-chart" data-chart-kind="'+detail.kind+'" data-chart-id="'+esc(detail.id)+'">Chart</button>'+
   '<details><summary>Counts and source</summary>'+ (detail.kind==='metric'?stateRows(stat(day,detail.id,detail.kind),detail,false):'')+Object.entries(stat(day,detail.id,detail.kind).series).map(([source,value])=>
    '<div class="series-entry"><strong>'+esc(source)+'</strong>'+cell(value,detail)+'</div>').join('')+'</details></div>').join('')+'</details>';
}
function renderTable(){const entries=data.tableEntries.filter(e=>$('group').value==='all'||e.group===$('group').value);$('tableSummary').textContent=entries.length+' measures';let html='<thead><tr><th>Measure group / metric</th>'+days.map(d=>'<th>'+d.date+(d.completeDay?'':' *')+'<br><span class="minor">'+d.attempts+' retained rows · '+d.reportable+' reportable<br>'+(d.inventoryHours>0?Number(d.inventoryHours).toFixed(1)+'h complete inventory':'Attempt inventory incomplete')+'</span></th>').join('')+'</tr></thead><tbody>',group='';for(const e of entries){if(group!==e.group){group=e.group;html+='<tr class="group"><th colspan="'+(days.length+1)+'">'+esc(group)+'</th></tr>';}html+='<tr data-table-kind="'+e.kind+'" data-table-id="'+esc(e.id)+'"><td><div class="metric-name"><strong>'+esc(e.label)+'</strong><button class="chart-button" data-chart-kind="'+e.kind+'" data-chart-id="'+esc(e.id)+'" aria-label="Chart '+esc(e.label)+'" aria-haspopup="dialog" aria-controls="chartPopover" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3v18h18M6 15l5-6 5 3 5-7"/></svg></button></div><details class="canonical-mapping"><summary>'+esc([...new Set(e.canonicalLinks.map(l=>l.recordLabel))].join(' · '))+'</summary>'+e.canonicalLinks.map(l=>'<p>'+esc(l.recordType)+'<br>'+esc(l.masterFieldIds.join(', '))+'<br>'+esc(l.relationship.replaceAll('_',' '))+': '+esc(l.basis)+'</p>').join('')+'</details><div class="minor">'+esc(e.kind==='quantity'?(countQuantity(e)?'Share of measured reports with at least one':'Median per measured report'):e.kind==='finding'?'Exact returned ID · complete inventories':e.denominator)+'</div></td>'+days.map(d=>{const v=stat(d,e.id,e.kind),mixed=Object.keys(v.series).length>1;
let headlineSource;
const hero=e.kind==='metric'?tableStateHeadline(e,v):null;
const body=cell(v,e,mixed?source=>{headlineSource=source;}:undefined,true,hero,noDispatch(d));
const heroCount=hero&&Object.keys(v.counts).some(state=>state!=='unavailable'&&state!=='unknown')?
 '<div class="minor">'+esc(hero[1])+': '+tableStateCount(v,hero[0])+'/'+v.denominator+' eligible retained rows</div>':'';
const allStates=(mixed||heroCount)&&e.kind==='metric'?'<div class="series-entry"><strong>All eligible rows</strong>'+heroCount+stateRows(v,e,false)+'</div>':'';
return '<td>'+body+'<details class="series-list"><summary>'+(mixed?'Separate sources':'Source / version')+' ('+Object.keys(v.series).length+')</summary>'+allStates+Object.entries(v.series).map(([s,p])=>'<div class="series-entry"><strong>'+esc(s)+'</strong>'+(s===headlineSource?' <span class="minor">· Shown above</span>':'')+cell(p,e)+'</div>').join('')+'</details>'+supportingDetails(d,e)+'</td>';}).join('')+'</tr>';}$('daily').innerHTML=html+'</tbody>';if(!tableInitialized){const scroller=$('daily').closest('.table-scroll');scroller.scrollLeft=scroller.scrollWidth;tableInitialized=true;}for(const b of $('daily').querySelectorAll('[data-chart-id]'))b.onclick=()=>selectChart(b.dataset.chartKind,b.dataset.chartId,b.getBoundingClientRect());}
function position(){if(!anchor||$('chartPopover').hidden)return;const pop=$('chartPopover'),w=document.documentElement.clientWidth,h=innerHeight,space=w-anchor.right-22;pop.style.width=Math.min(580,space>=340?space:w-24)+'px';const rect=pop.getBoundingClientRect();pop.style.left=Math.max(12,Math.min(anchor.right+10,w-rect.width-12))+'px';pop.style.top=Math.max(12,Math.min(anchor.bottom-rect.height,h-rect.height-12))+'px';}
function refreshPopover(){if($('chartPopover').hidden)return;$('chartPopoverTitle').textContent=$('trendTitle').textContent;const svg=$('trend').cloneNode(true);svg.removeAttribute('id');$('popoverGraph').replaceChildren(svg);$('popoverLegend').innerHTML=$('legend').innerHTML;for(const [a,b]of [['popoverState','chartState'],['popoverSource','chartSource']]){$(a).replaceChildren(...[...$(b).options].map(o=>o.cloneNode(true)));$(a).value=$(b).value;}const contract=selectedKind==='finding'?data.contracts?.findings:(selectedKind==='quantity'?data.contracts?.quantities:data.contracts?.metrics)?.find(c=>c.id===selectedMetric);$('contract').innerHTML=Object.entries(contract??{}).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(typeof v==='string'?v:JSON.stringify(v))+'</dd>').join('');position();}
function close(){ $('chartPopover').hidden=true;anchor=null;for(const b of document.querySelectorAll('[data-chart-id][aria-expanded="true"]'))b.setAttribute('aria-expanded','false');}
function selectChart(kind,id,rect=null){selectedKind=kind;selectedMetric=id;selectedState='__primary__';selectedSource='all';$('metric').value=kind+':'+id;options();draw();if(rect){anchor=rect;$('chartPopover').hidden=false;refreshPopover();$('closeChartPopover').focus({preventScroll:true});}else close();}
function renderInputCoverage(rows){const c=inputCoverage(rows),matched=c.states.verified_report+c.states.verified_originals;
$('inputCoverageSummary').textContent=matched+' / '+c.eligible+' readable reports have matching supplemental input; '+c.states.verified_originals+' also have verified original-bundle linkage. This describes audit inputs, not scanner accuracy.';
$('inputCoverage').innerHTML='<thead><tr><th scope="col">Day (Los Angeles)</th><th scope="col">Readable reports</th><th scope="col">Matched reports</th><th scope="col">Original bundle linked</th><th scope="col">No supplemental file</th><th scope="col">Other input gaps</th><th scope="col">Not evaluated</th></tr></thead><tbody>'+c.days.map(d=>{const s=d.states,gaps=[['Wrong generation',s.generation_mismatch],['Unverifiable generation',s.generation_unverifiable],['Rejected provenance',s.rejected_provenance],['Conflicting generation',s.conflicting_generation]].filter(x=>x[1]).map(x=>esc(x[0])+': '+x[1]).join('<br>')||'0';return '<tr><th scope="row">'+esc(d.date)+'</th><td>'+d.eligible+'</td><td>'+(s.verified_report+s.verified_originals)+'</td><td>'+s.verified_originals+'</td><td>'+s.missing_input+'</td><td>'+gaps+'</td><td>'+s.not_evaluated+'</td></tr>';}).join('')+'</tbody>';}
function render(){const rows=currentRows();renderInputCoverage(rows);days=engine.aggregate(data,rows,true);options();draw();renderTable();$('stats').innerHTML=[['Retained scans / attempts',rows.length],['Readable reportable rows',rows.filter(r=>r.reportable).length],['ID-only, no detailed export',rows.filter(r=>r.originProof==='production_id_selection_only').length],['Excluded canary/test',data.exclusionCounts?.excluded_canary_or_test??0]].map(([k,v])=>'<div><strong>'+v+'</strong><span>'+k+'</span></div>').join('');refreshPopover();}
function download(filename,content,type='text/csv'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('csv').onclick=()=>download('daily-metrics.csv',engine.stateCsv(days,data.csvMetrics));$('quantityCsv').onclick=()=>download('daily-volumes.csv',engine.quantityCsv(days,data.csvQuantities));$('findingCsv').onclick=()=>download('daily-findings.csv',engine.findingCsv(days,data.findingIds));$('region').onchange=$('origin').onchange=$('cmp').onchange=()=>{close();render();};$('group').onchange=renderTable;$('metric').onchange=()=>{const e=data.measureCatalog.entries.find(e=>key(e)===$('metric').value);selectChart(e.kind,e.id);};$('chartState').onchange=()=>{selectedState=$('chartState').value;draw();refreshPopover();};$('chartSource').onchange=()=>{selectedSource=$('chartSource').value;draw();refreshPopover();};$('popoverState').onchange=()=>{$('chartState').value=$('popoverState').value;$('chartState').onchange();};$('popoverSource').onchange=()=>{$('chartSource').value=$('popoverSource').value;$('chartSource').onchange();};$('closeChartPopover').onclick=close;document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});window.addEventListener('resize',position);$('closeProof').onclick=()=>$('proof').close();$('sources').onclick=()=>{$('proofBody').innerHTML='<ul>'+data.limitations.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><pre>'+esc(JSON.stringify({version:data.version,metricContractVersion:data.metricContractVersion,exclusions:data.exclusionCounts,sources:data.sources},null,2))+'</pre>';$('proof').showModal();};
const parityItems=new Map((data.masterValueParity?.items??[]).map(i=>[i.legacyId,i]));
const resolutionLabels={close_locally:'Close locally',intentional_subset:'Intentional subset',implemented_locally:'Implemented locally',blocked_missing_evidence:'Blocked by missing evidence',review_later:'Review later',represented:'Represented'};
function reviewResolution(item,view){const r=item.viewReview[view],coverage=view==='audit'?data.masterValueParity?.p2Coverage?.items.find(p=>p.legacyId===item.canonicalId):null;return r.resolution==='implemented_locally'&&coverage&&coverage.availableScans===0?'blocked_missing_evidence':r.resolution??'review_later';}
function p2CoverageCell(item,view){
 if(view!=='audit')return '';const p=data.masterValueParity?.p2Coverage?.items.find(p=>p.legacyId===item.canonicalId);if(!p)return '';
 const isCompact=g=>g.schema==='certscore.audit-privacy-form-receipt.v1';
 const compact=p.groups.some(isCompact);
 const groups=p.groups.slice().sort((a,b)=>Number(b.retainedRecords>0)-Number(a.retainedRecords>0)||Number(isCompact(b))-Number(isCompact(a))||b.date.localeCompare(a.date)).slice(0,12);
 const persisted=p.groups.some(g=>g.sourceView==='persisted_assessment');
 return '<details class="gap-review p2-coverage"><summary>Retained audit coverage · '+p.availableScans.toLocaleString()+' / '+p.eligibleScans.toLocaleString()+' scans</summary><p><strong>'+p.retainedRecords.toLocaleString()+' retained '+esc(p.unit)+'</strong> across '+p.scansWithRecords.toLocaleString()+' scans: '+p.records.toLocaleString()+' known-value records and '+p.unknownRecords.toLocaleString()+' explicit unknown records. '+p.emptyInventoryScans.toLocaleString()+' additional scans have verified empty inventories.</p><p>'+p.unavailableScans.toLocaleString()+' scans have no known value or verified empty inventory. Source-derived coverage, not independent parity or successful actions.</p>'+(persisted?'<p class="p2-persisted-scope">Connected to verified local persisted assessments. These are audit-only inputs, not customer report/full-file parity. Form values cover the initial passive main-document inventory; post-Accept and full-site scope are separate.</p>':'')+(compact?'<p class="p2-compact-receipt">Verified compact receipt groups are listed separately below.</p>':'')+'<p>'+esc(Object.entries(p.states).map(([k,v])=>k.replaceAll('_',' ')+': '+v).join(' · '))+'</p><p>Separate UTC date / schema / policy / creator groups. No pooled rate across incompatible groups. Field and form records are not scan denominators.</p>'+groups.map(g=>'<div class="p2-measurement-group"><p>'+esc(g.date+' · '+g.sourceView+' · '+g.schema+' · '+g.generation+' · '+g.policy+' · '+g.originProof)+'<br>'+g.availableScans+' / '+g.scans+' scans with known values or verified empty inventory ('+(g.coverageRate===null?'unavailable':(100*g.coverageRate).toFixed(1)+'%')+'); '+g.retainedRecords+' retained records, '+g.unknownRecords+' explicit unknown<br>'+esc(Object.entries(g.values).map(([k,v])=>k+': '+v).join(' · '))+'</p>'+(Object.keys(g.facets??{}).length?'<details class="p2-assessment-values"><summary>Retained assessment values</summary><p>Each named dimension is counted separately. Collection-notice point counts are records, not scans. These values are not overall pass/fail verdicts.</p>'+Object.entries(g.facets).map(([name,values])=>'<p>'+esc(name.replaceAll('_',' ').replaceAll('.',' '))+': '+esc(Object.entries(values).map(([k,v])=>k+': '+v).join(' · '))+'</p>').join('')+'</details>':'')+'</div>').join('')+'<p>Preview: up to 12 groups, prioritizing retained records. All dates/groups are included in Download value mapping and parity. Missing-day coverage stays in the daily dashboard.</p></details>';
}
function reviewBadge(item,view){const r=item.viewReview[view];if(r.gap==='none'&&r.resolution!=='implemented_locally'&&!r.displayLabel)return '';const status=reviewResolution(item,view),connected=view==='audit'&&data.masterValueParity?.p2Coverage?.items.find(p=>p.legacyId===item.canonicalId)?.groups.some(g=>g.sourceView==='persisted_assessment'&&g.retainedRecords>0),label=r.displayLabel??(connected&&status==='implemented_locally'?'Connected · local evidence':resolutionLabels[status]);return '<details class="gap-review" data-disposition="'+esc(r.disposition)+'" data-resolution="'+status+'"><summary>'+esc(label)+'</summary><p>'+esc(r.reason)+'</p><p>'+esc(r.nextStep)+'</p></details>';}
function reportFormatCell(item){return '<details class="gap-review report-formats"><summary>Formats · Web · PDF · DOCX</summary>'+Object.entries(item.reportFormats).map(([format,c])=>'<p data-report-format="'+format+'"><strong>'+format.toUpperCase()+' · '+esc(c.label)+'</strong><br>'+esc(c.detail)+(c.formatDifference?'<br>'+esc(c.formatDifference):'')+(c.checks.length?'<br><span class="minor">Fixture: '+esc(c.checks.join(' · '))+'</span>':'')+'</p>').join('')+'<p class="minor">Rendered-file checks use local fixtures. Production artifacts and complete visual-layout parity remain unverified.</p></details>';}
function masterValueCell(item,view){const context=view==='audit'?data.masterValueParity?.contextValues?.[item.canonicalId]:null;const mapping=item.valueMapping.views[view],counts=parityItems.get(item.canonicalId)?.views[view]??{},pairs=parityItems.get(item.canonicalId)?.pairs??{};return '<details class="gap-review master-value-check"><summary>Value mapping · '+esc(mapping.mode.replaceAll('_',' '))+(mapping.guidanceId?' · Accepted scope / hold':'')+'</summary><p>'+esc(mapping.reason)+'</p><code>'+esc(mapping.paths.join(' · ')||'No exact path registered')+'</code>'+(mapping.guidanceId?'<p><strong>Accepted scope / hold: '+esc(mapping.guidanceId.replaceAll('_',' '))+'</strong></p>':'')+(context?'<p>Snapshot scope · '+esc(context.status)+' · '+esc(context.qualification)+'</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(context.value??null).slice(0,1200))+'</pre><p>Preview only; full context receipt is included in the mapping download.</p>':'')+'<p>Retained-value states: '+esc(Object.entries(counts).map(([k,v])=>k.replaceAll('_',' ')+': '+v.toLocaleString()).join(' · ')||'Not evaluated')+'</p><p>Parity: '+esc(Object.entries(pairs).map(([k,v])=>k+' '+Object.entries(v).map(([s,n])=>s.replaceAll('_',' ')+': '+n.toLocaleString()).join(', ')).join(' · ')||'No retained paired views')+'</p></details>';}
const masterParity=data.masterValueParity;
$('masterParitySummary').textContent=masterParity?masterParity.comparisons.toLocaleString()+' comparable values · '+masterParity.mismatches+' mismatches · '+masterParity.evaluatedScans.toLocaleString()+' scans':'Retained value parity not evaluated';
$('masterParityScope').textContent=masterParity?.scope??'No retained parity receipt.';
const mappingModes={};for(const item of data.coverageMatrix.masterCatalog.valueMappings.items)for(const mapping of Object.values(item.views))mappingModes[mapping.mode]=(mappingModes[mapping.mode]??0)+1;
$('mappingCoverageSummary').textContent='Value routes across four views: '+Object.entries(mappingModes).map(([mode,count])=>count+' '+mode.replaceAll('_',' ')).join(' · ')+'. Summary-only and omitted routes are not exact parity passes.';
const p2Resolutions={};for(const cell of data.coverageMatrix.review.p2Cells??[]){const item=data.coverageMatrix.domains.flatMap(d=>d.items).find(i=>i.canonicalId===cell.id),status=reviewResolution(item,cell.view);p2Resolutions[status]=(p2Resolutions[status]??0)+1;}
$('p2ResolutionSummary').textContent='P2 decisions across '+(data.coverageMatrix.review.p2Cells??[]).length+' item/view gaps: '+Object.entries(p2Resolutions).map(([status,n])=>n+' '+resolutionLabels[status].toLowerCase()).join(' · ')+'. Local implementation is separate from retained-input availability and production verification.';
$('catalogGuidanceItems').innerHTML=(data.coverageMatrix.masterCatalog.valueMappings.guidance??[]).map(g=>'<p><strong>'+esc((g.status==='on_hold'?'On hold · ':'Accepted · ')+g.title)+'</strong><br>'+esc(g.question)+'<br>Recommendation: '+esc(g.recommendation)+'<br><span class="minor">'+esc(g.scope)+'</span></p>').join('');
$('catalogGuidanceItems').insertAdjacentHTML('beforeend','<h4>Forward gap utility review</h4>'+(data.coverageMatrix.review.forwardUtility??[]).map(r=>'<p><strong>'+esc(r.decision.replaceAll('_',' '))+'</strong> · '+esc(r.question)+'<br>'+esc(r.localFix)+'<br><span class="minor">'+esc(r.remaining)+'</span></p>').join(''));
$('masterParityDownload').onclick=()=>download('certscore-master-value-parity.json',JSON.stringify({mappings:data.coverageMatrix.masterCatalog.valueMappings,parity:masterParity},null,2)+'\\n','application/json');
function coverageGroups(){return data.coverageMatrix?.[$('coverageGrouping').value]??[];}
function coverageAreaOptions(){
 $('coverageArea').innerHTML='<option value="all">All areas</option><option value="report_box">Report-box items</option><option value="audit_only">Audit supplement items</option>'+coverageGroups().map(a=>'<option value="'+esc(a.id)+'">'+esc(a.title)+'</option>').join('');
 $('coverageHierarchyHeader').textContent=$('coverageGrouping').value==='concepts'?'Master record / compatibility item':$('coverageGrouping').value==='domains'?'Master canonical item':'Report area / current item';
}
const coverageViewNames={report:'Scan report',standard:'Standard JSON evidence',full:'Full evidence file',audit:'Daily audit coverage'};
const reviewLabels={close:'Recommend closing',retain_omission:'Intentional omission',review_later:'Review later',covered:'Represented'};
function matchesCoverageReview(i){
 const filter=$('coverageReview').value,view=$('coverageView').value,normalization=$('normalizationFilter').value;
 if(normalization==='retirement'&&!['alias_candidate','retire_standalone'].includes(i.normalization.decision))return false;
 if(normalization!=='all'&&normalization!=='retirement'&&i.normalization.decision!==normalization)return false;
 if(filter==='all')return true;
 if(filter==='flagged')return i.valueReview.flag!=='retain';
 if(['potential_overlap','low_standalone_value'].includes(filter))return i.valueReview.flag===filter;
 return (view==='all'?['report','standard','full','audit']:[view]).some(v=>{const r=i.viewReview[v];return reviewResolution(i,v)===filter||r.gap===filter||r.disposition===filter||r.priority===filter;});
}
function renderCoverageMatrix(){
 const matrix=data.coverageMatrix,selected=$('coverageArea').value,kind=$('coverageKind').value,query=$('coverageSearch').value.trim().toLowerCase();
 const groups=coverageGroups().filter(a=>['all','report_box','audit_only'].includes(selected)||a.id===selected).map(a=>({...a,items:a.items.filter(i=>matchesCoverageReview(i)&&(selected!=='audit_only'||i.auditSupplement)&&(selected!=='report_box'||!i.auditSupplement)&&(kind==='all'||i.kind===kind)&&(!query||[a.title,i.subject,i.item,i.canonicalId,i.definition,i.valueReview.reason,i.normalization.proposedConcept,i.normalization.field,i.normalization.reason,i.normalization.itemReason,...['report','standard','full','audit'].map(k=>i[k].status+' '+i[k].detail+' '+i.viewReview[k].reason)].join(' ').toLowerCase().includes(query)))})).filter(a=>a.items.length);
 for(const body of $('coverageMatrix').querySelectorAll('tbody'))body.remove();
 $('coverageMatrix').insertAdjacentHTML('beforeend',groups.map(a=>'<tbody data-matrix-area="'+esc(a.id)+'"><tr class="coverage-area '+(a.kind==='audit_only'?'audit-area':'')+'"><th scope="rowgroup" colspan="5">'+esc(a.title)+(a.kind==='audit_only'?' · Audit operations / supplements':'')+'<span class="area-note">'+esc(a.visibility)+'</span></th></tr>'+a.items.map(i=>'<tr data-matrix-item="'+esc(i.canonicalId)+'" data-value-review="'+esc(i.valueReview.flag)+'"><th scope="row" class="item-name"><span class="catalog-subject">'+esc(i.subject)+' · '+esc(i.kind)+'</span>'+esc(i.item)+'<span class="normalization-tag" data-decision="'+esc(i.normalization.decision)+'">'+esc(i.normalization.label)+'</span><details class="normalization-detail"><summary>Catalog definition and mapping</summary><p><strong>'+esc(i.normalization.proposedConcept)+'</strong> · '+esc(i.normalization.layer)+'</p><code>'+esc(i.normalization.proposedConceptId+' → '+i.normalization.field)+'</code><p>'+esc(Object.entries(i.normalization.dimensions).map(([k,v])=>k+'='+v).join(' · ')||'No fixed variant dimensions in this mapping.')+'</p><p>'+esc(i.normalization.reason)+'</p><p>'+esc(i.normalization.itemReason)+'</p><p>Master ID: '+esc(i.masterField.id)+'</p><p>Value: '+esc(i.masterField.valueContract.type)+' · '+esc(i.masterField.definition)+' Scope: '+esc(i.masterField.sourceScope)+'</p><p>'+esc(i.normalization.migration)+'</p></details>'+(i.valueReview.flag==='retain'?'':'<span class="value-tag" data-value="'+esc(i.valueReview.flag)+'">'+esc(i.valueReview.label)+'</span><details class="catalog-definition"><summary>Value review</summary><p>'+esc(i.valueReview.reason)+'</p><p>'+esc(i.valueReview.recommendation)+'</p><p>'+esc(i.valueReview.relatedIds.join(', '))+'</p></details>')+'<details class="catalog-definition"><summary>Definition</summary><p>'+esc(i.definition)+'</p><code>'+esc(i.canonicalId)+'</code><p>Scope: '+esc(i.scope)+' · '+esc(i.valueType)+' · '+esc(i.cardinality)+'</p><p>See each view’s retained-value check for this cohort.</p></details></th>'+['report','standard','full','audit'].map(k=>{const r=i.viewReview[k];return '<td data-coverage-column="'+k+'"><span class="coverage-badge" data-status="'+esc(i[k].status)+'">'+esc(i[k].status)+'</span>'+(i[k].conditions?'<p class="coverage-condition">'+esc(i[k].conditions)+'</p>':'')+'<p data-coverage-detail>'+esc(i[k].detail)+'</p>'+(k==='report'?reportFormatCell(i):'')+masterValueCell(i,k)+reviewBadge(i,k)+p2CoverageCell(i,k)+'</td>';}).join('')+'</tr>').join('')+'</tbody>').join(''));
 const count=groups.reduce((n,a)=>n+a.items.length,0);$('coverageMatrixSummary').textContent=count+' matching catalog items across '+groups.length+' groups · '+(matrix?.migration?.originalTopics??0)+' original topics mapped · view: '+($('coverageView').value==='all'?'any of the four views':coverageViewNames[$('coverageView').value])+' · counts describe output representation, not missing scan values.'+(count?'':' No matching items.');
}
$('coverageGapCards').innerHTML=(data.coverageMatrix?.review?.views??[]).map(v=>'<button class="gap-card" data-gap-view="'+esc(v.view)+'"><span>'+esc(coverageViewNames[v.view])+'</span><strong>'+v.omitted+' omitted / '+v.total+'</strong><span>'+v.represented+' represented · '+v.relatedOnly+' related-only audit bindings</span><span>'+v.closeLocally+' to close locally · '+v.intentional+' intentional · '+v.deferred+' review later</span><span>Show all omitted items →</span></button>').join('');
$('coverageGapCards').onclick=e=>{const button=e.target.closest('[data-gap-view]');if(!button)return;$('coverageView').value=button.dataset.gapView;$('coverageReview').value='omitted';$('coverageGrouping').value='domains';coverageAreaOptions();$('coverageKind').value='all';$('normalizationFilter').value='all';$('coverageSearch').value='';renderCoverageMatrix();$('coverageMatrixSummary').scrollIntoView({block:'start'});};
const normalization=data.coverageMatrix.normalizationReview;
$('normalizationSummary').textContent='Master catalog v2 · '+normalization.proposedConcepts.length+' record types · '+normalization.reviewedItems+' compatibility items · no evidence deleted';
$('normalizationCounts').innerHTML=normalization.decisions.map(d=>'<button data-normalization-decision="'+esc(d.id)+'">'+d.count+' · '+esc(d.label)+'</button>').join('');
$('normalizationFilter').insertAdjacentHTML('beforeend',normalization.decisions.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.label)+' ('+d.count+')</option>').join(''));
function resetTaxonomyFilters(){coverageAreaOptions();$('coverageKind').value='all';$('coverageSearch').value='';$('coverageView').value='all';$('coverageReview').value='all';}
$('normalizationCounts').onclick=e=>{const button=e.target.closest('[data-normalization-decision]');if(!button)return;resetTaxonomyFilters();$('normalizationFilter').value=button.dataset.normalizationDecision;renderCoverageMatrix();$('coverageMatrixSummary').scrollIntoView({block:'start'});};
$('showProposedConcepts').onclick=()=>{$('coverageGrouping').value='concepts';resetTaxonomyFilters();$('normalizationFilter').value='all';renderCoverageMatrix();$('coverageMatrixSummary').scrollIntoView({block:'start'});};
$('normalizationBasis').textContent=normalization.basis+' '+data.coverageMatrix.masterCatalog.resolutions.map(r=>r.reason).join(' ');
$('normalizationWorkflow').innerHTML=data.coverageMatrix.masterCatalog.nextGates.map(step=>'<li>'+esc(step)+'</li>').join('');
$('normalizationDecisions').textContent='Page/technology aliases were rejected; industry remains benchmark context. The 231 legacy IDs remain mapped. Output value adapters and serializer migrations have not run.';
$('normalizationDownload').onclick=()=>download('certscore-master-catalog-v2.json',JSON.stringify(data.coverageMatrix.masterCatalog,null,2)+'\\n','application/json');
$('coverageReviewBasis').textContent=data.coverageMatrix?.review?.basis??'';
$('coveragePriorityList').innerHTML=(data.coverageMatrix?.review?.priorityOrder??[]).map(p=>'<li><strong>'+esc(p.priority+' · '+p.title)+'</strong><p>'+esc(p.kind)+'</p><p>'+esc(p.reason)+'</p></li>').join('');
coverageAreaOptions();
$('coverageKind').insertAdjacentHTML('beforeend',(data.coverageMatrix?.catalog?.kinds??[]).map(k=>'<option value="'+esc(k)+'">'+esc(k)+'</option>').join(''));
const formatCounts={};for(const item of data.coverageMatrix.domains.flatMap(d=>d.items)){const s=item.reportFormats.pdf.status;formatCounts[s]=(formatCounts[s]??0)+1;}
$('reportFormatPolicy').textContent='PDF / DOCX local checks: '+(formatCounts.rendered_value_checked??0)+' values checked; '+(formatCounts.rendered_summary_checked??0)+' summaries checked; '+((formatCounts.source_reviewed_boundary??0)+(formatCounts.not_item_verified??0))+' items still without rendered-value parity; '+(formatCounts.outside_report_scope??0)+' outside report scope. '+data.coverageMatrix.reportFormats.basis+' '+data.coverageMatrix.reportFormats.differences.join(' ');
$('fullEvidencePolicy').textContent=(data.coverageMatrix?.full??'')+' Customer consent evidence v1 is also local and not deployed; historical exports are unchanged.';
$('coverageFileScope').textContent=[data.coverageMatrix?.standard,data.coverageMatrix?.full,data.coverageMatrix?.audit].filter(Boolean).join(' ');
$('catalogScope').textContent=data.coverageMatrix?.catalog?.scope??'';
$('catalogDownload').onclick=()=>download('certscore-evidence-catalog.json',JSON.stringify(data.coverageMatrix,null,2)+'\\n','application/json');
$('coverageGrouping').onchange=()=>{coverageAreaOptions();renderCoverageMatrix();};$('coverageArea').onchange=$('coverageKind').onchange=$('coverageView').onchange=$('coverageReview').onchange=$('normalizationFilter').onchange=renderCoverageMatrix;$('coverageSearch').oninput=renderCoverageMatrix;renderCoverageMatrix();
$('coverageMap').innerHTML=[['report_box','Scan-report evidence boxes · 1:1 section map'],['audit_only','Audit-only areas · not additional report boxes']].map(([kind,title])=>'<div data-coverage-group="'+kind+'"><h3>'+title+'</h3>'+(data.coverageMap??[]).filter(c=>c.kind===kind).map(c=>'<section data-coverage-id="'+esc(c.id)+'"><h4>'+esc(c.box)+'</h4>'+(c.visibility?'<p><strong>Shown in the scan report:</strong> '+esc(c.visibility)+'</p>':'')+'<p><strong>'+(kind==='report_box'?'Report contents:':'Relationship to the report:')+'</strong> '+esc(c.report)+'</p><p><strong>Additions to audit coverage:</strong> '+esc(c.now)+'</p><p><strong>Remaining gaps:</strong> '+esc(c.gap)+'</p></section>').join('')+'</div>').join('');$('issues').innerHTML='<p>Statuses are retained context; this dashboard repair does not close production issues.</p>'+data.issues.map(i=>'<p>'+esc(i.id)+' · '+esc(i.title)+' · '+esc(i.status)+'</p>').join('')+'<pre>'+esc(JSON.stringify(data.releaseMarkers,null,2))+'</pre>';window.__auditDashboard={data,engine,get days(){return days;},currentRows};render();})();
</script></body></html>`;
}
