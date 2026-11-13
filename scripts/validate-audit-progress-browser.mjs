/** File-only audit viewer verification. External requests are rejected and counted. */
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]),file=path.join(root,'dashboard.html');const browser=await chromium.launch({headless:true});let externalRequests=0;const errors=[],checks={};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await context.route('**/*',route=>{if(!route.request().url().startsWith('file:')){externalRequests++;return route.abort();}return route.continue();});const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:60000});await page.waitForFunction(()=>window.__auditDashboard?.days?.length>0,{timeout:60000});
 const assertDataHealth=async()=>{
  const actual=await page.evaluate(()=>{
   const a=window.__auditDashboard,h=a.health;
   const day=new Intl.DateTimeFormat('en-CA',{timeZone:a.data.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
   const rows=a.currentRows().filter(r=>day.format(new Date(r.createdAt))===h.date),reports=rows.filter(r=>r.reportable);
   return {h,attempts:rows.length,reportable:reports.length,quantities:h.quantities.map(q=>({id:q.id,measured:reports.filter(r=>Number.isFinite(r.measurements?.[q.id])).length,unavailable:reports.filter(r=>!Number.isFinite(r.measurements?.[q.id])).length}))};
  });
  assert.equal(actual.h.attempts,actual.attempts);assert.equal(actual.h.reportable,actual.reportable);
  for(const q of actual.quantities){const h=actual.h.quantities.find(v=>v.id===q.id);assert.equal(h.measured,q.measured);assert.equal(h.unavailable,q.unavailable);assert.equal(h.zero+h.positive,h.measured);}
  assert.match(await page.locator('#healthCounts').textContent(),new RegExp('Reportable'));
  assert.match(await page.locator('#healthFreshness').textContent(),/cutoff.*Los Angeles.*does not refresh/);
  assert.match(await page.locator('#healthComparison').textContent(),/identical region, profile and retained source\/version map/);
  return actual.h;
 };
 const health=await assertDataHealth();
 const healthContext=await page.evaluate(()=>window.__auditDashboard.data.healthContext);
 if(healthContext.cache){
  const bytes=await fs.readFile(healthContext.cache.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),healthContext.cache.sha256);
  const cache=JSON.parse(bytes),pending=cache.receipts.filter(r=>r.state==='source_unavailable');
  assert.equal(health.pending.count,pending.length);
  assert.deepEqual(healthContext.pending.map(r=>r.scanId).sort(),pending.map(r=>r.scanId).sort());
  const inventoryCache=new Map();
  for(const entry of pending){
   const ref=entry.selectionInventory??cache.directInventory;
   if(!inventoryCache.has(ref.file)){const b=await fs.readFile(ref.file);assert.equal(createHash('sha256').update(b).digest('hex'),ref.sha256);assert.equal(b.length,ref.bytes);inventoryCache.set(ref.file,JSON.parse(b));}
   const original=inventoryCache.get(ref.file).rows.find(r=>r.scanId===entry.scanId);
   assert.equal(healthContext.pending.find(r=>r.scanId===entry.scanId).createdAt,original.created_at);
   assert.equal(healthContext.pending.find(r=>r.scanId===entry.scanId).status,original.status??'unavailable');
  }
 }
 checks.dataHealth=true;
 const chartPanel=page.locator('#chartPanel'),chartSummary=chartPanel.locator(':scope > summary');
 assert.equal(await chartPanel.evaluate(panel=>panel.open),false);
 assert.equal(await page.locator('#metric').isVisible(),false);
 assert.ok((await chartPanel.boundingBox()).height<140);
 await chartSummary.focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#metric').isVisible(),true);
 assert.equal(await page.locator('#trend').isVisible(),true);
 await chartSummary.click();
 assert.equal(await chartPanel.evaluate(panel=>panel.open),false);
 checks.collapsedChart=true;
 assert.equal(await page.locator('#daily tbody tr[data-table-id]').count(),await page.evaluate(()=>window.__auditDashboard.data.tableEntries.length));
 assert.equal(await page.evaluate(()=>{
  const data=window.__auditDashboard.data;
  return ['retainedReports','optOutExtracts','privacyFormReceipts'].every(key=>!(key in data))&&
   data.rows.every(row=>!('refs' in row));
 }),true);
 const measureCatalog=await page.evaluate(()=>window.__auditDashboard.data.measureCatalog);
 assert.ok(measureCatalog?.entries?.length>0);
 const tableEntries=measureCatalog.tableEntries;
 const displayedEntries=await page.evaluate(()=>window.__auditDashboard.data.tableEntries);
 const gpcQuestions=await page.evaluate(()=>window.__auditDashboard.data.gpcQuestions);
 assert.equal(gpcQuestions.length,4);
 assert.deepEqual(tableEntries.filter(e=>e.group==='GPC').map(e=>e.id),gpcQuestions.map(q=>q.primaryMetric));
 assert.ok(tableEntries.find(e=>e.id==='detail.gpc.cmp_receipt').details.some(e=>e.id==='detail.gpc.response'));
 assert.deepEqual(gpcQuestions.map(q=>q.title),['GPC signal delivered','Activity under GPC (all)','GPC acknowledged','California-qualified activity under GPC']);
 assert.equal(await page.evaluate(ids=>window.__auditDashboard.days.every(day=>ids.every(id=>day.metrics[id].denominator===day.reportable)),gpcQuestions.map(q=>q.primaryMetric)),true);
 const meanings=page.locator('#daily tbody tr[data-table-id] > td:first-child > .metric-meaning');
 assert.equal(await meanings.count(),displayedEntries.length);
 for(const text of await meanings.allTextContents())assert.ok(text.length>25&&!text.includes('undefined'),text);
 assert.match(await page.locator('[data-table-id="registration.accept"] > td:first-child > .metric-meaning').textContent(),/Usable scans.*confirmed Accept choice/);
 assert.match(await page.locator('[data-table-id="inventory.cookies"] > td:first-child > .metric-meaning').textContent(),/Measured reports.*distinct cookies.*Missing measurements are excluded/);
 assert.ok(await page.locator('.gpc-acknowledged-activity').count()>0);
 for(const item of await page.locator('.gpc-acknowledged-activity').all())assert.equal(await item.evaluate(el=>el.open),false);
 const acknowledgmentSample=await page.evaluate(()=>{
  const d=window.__auditDashboard.days.findIndex(day=>day.date==='2026-11-08'&&day.reportable===51&&day.metrics['detail.gpc.cmp_receipt'].counts.received===2);
  return d;
 });
 if(acknowledgmentSample>=0){
  const cell=page.locator('[data-table-id="detail.gpc.cmp_receipt"] > td').nth(acknowledgmentSample+1);
  assert.equal(await cell.locator(':scope > .value').textContent(),'3.9%');
  assert.match(await cell.locator(':scope > .states [data-headline]').textContent(),/2\/51/);
  assert.match(await cell.locator('.gpc-acknowledged-activity').textContent(),/2 acknowledged visits/);
 }
 assert.match(await page.locator('[data-table-id="detail.gpc.session_collection"] > td:first-child > .metric-meaning').textContent(),/sale\/sharing role is unresolved.*Script downloads alone do not count/);
 assert.match(await page.locator('[data-table-id="detail.gpc.california_collection"] > td:first-child > .metric-meaning').textContent(),/narrower subset.*identifier syncing or audience collection/);
 const prominenceRow='[data-table-id="customer_cmp_check.prominence"]';
 const validComparisonRow=page.locator(prominenceRow+' + [data-table-id="customer_cmp_check.prominence_valid_comparison"]');
 if(tableEntries.some(entry=>entry.id==='customer_cmp_check.prominence')){
  assert.equal(await validComparisonRow.locator('.metric-name').textContent(),'Accept and Reject prominence valid comparison');
  assert.equal(displayedEntries.length,tableEntries.length+1);
 }
 const prominenceSample=await page.evaluate(()=>window.__auditDashboard.days.findIndex(day=>
  day.date==='2026-11-08'&&day.reportable===51&&day.metrics['customer_cmp_check.prominence'].counts.observed===1));
 if(prominenceSample>=0){
  const originalCell=page.locator(prominenceRow+' > td').nth(prominenceSample+1);
  assert.equal(await originalCell.locator(':scope > .value').textContent(),'11.8%');
  assert.equal(await originalCell.locator('.prominence-coverage').textContent(),'Both observed: 6/51');
  const cell=validComparisonRow.locator(':scope > td').nth(prominenceSample+1);
  assert.equal(await cell.locator(':scope > .value').textContent(),'2.0%');
  assert.equal(await cell.locator('.prominence-coverage').textContent(),'Valid comparison: 1/51');
  assert.match(await cell.textContent(),/5 without a completed comparison/);
  const original=await page.evaluate(()=>{
   const audit=window.__auditDashboard;
   const row=audit.data.rows.find(r=>r.reportable&&r.site==='adtarget.biz'&&r.states['customer_cmp_check.prominence']==='observed'&&
    new Intl.DateTimeFormat('en-CA',{timeZone:audit.data.timezone}).format(new Date(r.createdAt))==='2026-11-08');
   const id='customer_cmp_check.prominence';
   row.states[id]='review_recommended';
   document.getElementById('cmp').dispatchEvent(new Event('change'));
   return row.scanId;
  });
  try {
   assert.equal(await cell.locator('.prominence-coverage').textContent(),'Valid comparison: 1/51');
  } finally {
   await page.evaluate(scanId=>{
    window.__auditDashboard.data.rows.find(r=>r.scanId===scanId).states['customer_cmp_check.prominence']='observed';
    document.getElementById('cmp').dispatchEvent(new Event('change'));
   },original);
  }
  checks.prominenceCoverage=true;
 }
 checks.metricMeanings=true;
 checks.gpcFourQuestions=true;
 const metricCell=(id,index)=>{const owner=tableEntries.find(entry=>entry.details.some(detail=>detail.id===id));return owner?page.locator('[data-table-id="'+owner.id+'"] td').nth(index+1).locator('[data-supporting-id="'+id+'"]'):page.locator('[data-table-id="'+id+'"] td').nth(index+1);};
 const controlAccessibility='sealed.checklist.accessibility_consent_controls';
 const controlSample=await page.evaluate(id=>{
  const {days}=window.__auditDashboard;
  return days.findIndex(day=>day.date==='2026-11-09'&&day.metrics[id]?.counts.not_testable===84&&day.metrics[id].denominator===90);
 },controlAccessibility);
 if(controlSample>=0){
  const cell=metricCell(controlAccessibility,controlSample);
  assert.equal(await cell.locator(':scope > .value').textContent(),'6 of 90 had a test result');
  assert.equal(await cell.locator(':scope > .checklist-verdicts [data-state="not_observed"]').textContent(),'No issue observed: 6');
  assert.match(await cell.locator('.control-coverage').textContent(),/0\/90 reports with a detailed assessment receipt/);
  const fixtureId=await page.evaluate(()=>{
   const row=window.__auditDashboard.data.rows.find(r=>r.reportable&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date(r.createdAt))==='2026-11-09');
   row.controlAccessibilityCoverage={version:1,status:'partial',reasons:['control_results_missing','frames_outside_scope'],controls:2,completed:1,issues:0,review:0};
   document.getElementById('cmp').dispatchEvent(new Event('change'));return row.scanId;
  });
  try{
   const panel=cell.locator('.control-coverage');
   assert.match(await panel.textContent(),/1\/90 reports with a detailed assessment receipt/);
   assert.match(await panel.textContent(),/Control-specific rule results missing: 1 reports \(100%\)/);
   assert.match(await panel.textContent(),/Child-frame controls outside assessed scope/);
   assert.match(await panel.textContent(),/1\/2 retained controls completed/);
  }finally{await page.evaluate(id=>{delete window.__auditDashboard.data.rows.find(r=>r.scanId===id).controlAccessibilityCoverage;document.getElementById('cmp').dispatchEvent(new Event('change'));},fixtureId);}
  checks.controlAccessibilityCoverageReasons=true;
  checks.controlAccessibilityHeadline=true;
 }
 const verdictChecks=await page.evaluate(()=>{
  const {data,days}=window.__auditDashboard;
  const checks=[];
  for(const [id,layout] of Object.entries(data.verdictLayouts)){
   const row=document.querySelector('[data-table-id="'+id+'"]');
   for(const [index,day] of days.entries()){
    const verdict=day.metrics[layout.id],cell=row.cells[index+1];
    const headline=cell.querySelector(':scope > .value').textContent;
    if(['sealed.checklist.accessibility_consent_controls','sealed.checklist.cross_border_endpoint_review',
     'checklist.post_reject_tracking_reduction'].includes(id))continue;
    if(Object.keys(verdict.series).length>1){
     checks.push({id,date:day.date,actual:headline,expected:'Separate measurement groups'});
     continue;
    }
    const counts=verdict.counts;
    if(!Object.keys(counts).some(state=>state!=='unavailable'&&state!=='unknown'))continue;
    const percent=count=>{
     const rate=100*count/verdict.denominator;
     return (Number.isInteger(rate)?rate:rate.toFixed(1))+'%';
    };
    const gap=counts.gap_observed??0,partial=counts.review_signal??0;
    checks.push({id,date:day.date,actual:headline,expected:layout.hero==='observed'?'Observed · '+percent(counts.observed??0):
     layout.hero==='gap_observed'?(id==='checklist.pre_consent_third_party_tracking'?
      gap+(gap===1?' gap':' gaps')+' in '+verdict.denominator+' reports':'Gap observed · '+percent(gap)):'Partial concern · '+partial+' ('+percent(partial)+')'});
    const breakdown=[...(layout.hero==='observed'?[['gap_observed','Gap observed']]:[]),
     ...(layout.hero!=='review_signal'?[['review_signal','Partial concern']]:[]),['not_observed','Not observed'],
     ['insufficient_evidence','Insufficient evidence'],['not_confirmed','Not confirmed']];
    for(const [state,label] of breakdown){
     const count=counts[state]??0;
     const line=cell.querySelector(':scope > .checklist-verdicts > [data-state="'+state+'"]');
     checks.push({id,date:day.date,actual:line?.textContent,expected:label+': '+count+' ('+percent(count)+')'});
    }
   }
  }
  return {layouts:data.verdictLayouts,checks};
 });
 for(const id of ['checklist.pre_consent_third_party_tracking','checklist.pre_consent_cookies_storage',
  'checklist.social_media_embed_pre_consent','checklist.third_party_iframe_pre_consent',
  'sealed.checklist.cross_border_endpoint_review','sealed.checklist.sensitive_surfaces_third_party_tracking']){
  if(displayedEntries.some(entry=>entry.id===id))assert.equal(verdictChecks.layouts[id]?.hero,'gap_observed',id);
 }
 for(const id of ['privacy_policy','checklist.cookie_notice_policy_availability']){
  if(displayedEntries.some(entry=>entry.id===id))assert.equal(verdictChecks.layouts[id]?.hero,'observed',id);
 }
 for(const id of ['checklist.device_identification_fingerprinting_signal_observed',
  'checklist.embedded_content_pre_consent','checklist.session_replay_fingerprinting_review']){
  if(displayedEntries.some(entry=>entry.id===id))assert.ok(verdictChecks.layouts[id],id);
 }
 for(const {actual,expected,id,date} of verdictChecks.checks)assert.equal(actual,expected,id+' '+date);
 checks.checklistVerdicts=true;
 const observedOutcomes=await page.evaluate(()=>{
  const {days}=window.__auditDashboard;
  return [...document.querySelectorAll('#daily tr[data-table-id]')].flatMap(row=>
   days.flatMap((day,index)=>{
    const cell=row.cells[index+1],metric=day.metrics[row.dataset.tableId];
    if(!cell.querySelector(':scope > .state-percentages > [data-headline][data-state="observed"]')||
     metric?.source==='mixed_sources')return [];
    return Object.entries(metric.counts).filter(([state])=>state!=='observed').map(([state,count])=>{
     const rate=100*count/metric.denominator;
     return {id:row.dataset.tableId,state,date:day.date,
      actual:cell.querySelector(':scope > .state-percentages > [data-state="'+state+'"] .state-line-value')?.textContent,
      expected:(Number.isInteger(rate)?rate:rate.toFixed(1))+'%'};
    });
   }));
 });
 for(const {actual,expected,id,state,date} of observedOutcomes)assert.equal(actual,expected,id+' '+state+' '+date);
 checks.observedOutcomeBreakdown=true;
 const choiceRows=tableEntries.filter(entry=>entry.group==='Accept & Reject');
 for(const id of ['sealed.checklist.public_collection_surfaces','sealed.detail.sealed.form_destinations',
  'sealed.checklist.preference_withdrawal_control','customer_cmp_check.found_not_declared',
  'checklist.consent_optional_defaults_on','sealed.checklist.consent_optional_defaults_on']){
  assert.equal(await page.locator('#daily [data-table-id="'+id+'"]').count(),0);
 }
 const combinedActivity='customer_cmp_check.implementation';
 if(measureCatalog.entries.some(entry=>entry.id===combinedActivity)){
  assert.equal(await page.locator('[data-table-id="'+combinedActivity+'"]').count(),0);
  const rejectActivity=page.locator('[data-table-id="detail.reject.activity_all"]');
  assert.ok(await rejectActivity.locator('.supporting-evidence [data-supporting-id="'+combinedActivity+'"]').count()>0);
  assert.ok(tableEntries.find(entry=>entry.id==='detail.reject.activity_all').details.some(entry=>entry.id==='customer_cmp_check.consent_record')||
   !measureCatalog.entries.some(entry=>entry.id==='customer_cmp_check.consent_record'));
 }
 assert.equal(await page.evaluate(ids=>window.__auditDashboard.days.every(day=>ids.every(id=>day.metrics[id].denominator===day.reportable)),choiceRows.map(entry=>entry.id)),true);
 assert.deepEqual(choiceRows.map(entry=>[entry.id,entry.label]),[
  ['control.accept','Accept control presence'],
  ['click.accept','Accept click completed'],['detail.accept.activity_all','After Accept non-essential activity (all)'],
  ['registration.accept','Accept choice confirmed'],['detail.accept.verdict','After Accept non-essential activity (confirmed)'],
  ['control.reject','Reject control presence'],
  ['click.reject','Reject click completed'],['detail.reject.activity_all','After Reject non-essential activity (all)'],
  ['registration.reject','Reject choice confirmed'],['detail.reject.verdict','After Reject non-essential activity (confirmed)'],
 ]);
 for(const action of ['accept','reject']){
  const sample=await page.evaluate(action=>{
   const days=window.__auditDashboard.days;
   const index=days.findLastIndex(day=>day.metrics['registration.'+action].counts.confirmed>0);
   if(index<0)return null;
   const click=days[index].metrics['click.'+action],choice=days[index].metrics['registration.'+action];
   return {index,eligible:click.denominator,completed:click.counts.completed,confirmed:choice.counts.confirmed,choiceDenominator:choice.denominator};
  },action);
  if(!sample)continue;
  assert.equal(sample.eligible,sample.choiceDenominator);
  const confirmation=metricCell('registration.'+action,sample.index);
  assert.deepEqual(await confirmation.locator(':scope > .state-percentages > [data-state]').allTextContents(),[
   'Confirmed: '+sample.confirmed+'/'+sample.choiceDenominator,
  ]);
  const gap=sample.completed-sample.confirmed;
  assert.deepEqual(await confirmation.locator('.choice-confirmation-gap').allTextContents(),gap>0?[gap+' of '+sample.completed+' clicks lack confirmation']:[]);
  const details=confirmation.locator(':scope > details.series-list:not(.supporting-evidence)');
  assert.equal(await details.evaluate(panel=>panel.open),false);
  assert.match(await details.textContent(),new RegExp('confirmed: '+sample.confirmed+'/'+sample.choiceDenominator));
  const percentage=(count,denominator)=>{
   const value=100*count/denominator;
   return (Number.isInteger(value)?String(value):value.toFixed(1))+'%';
  };
  assert.equal(await metricCell('click.'+action,sample.index).locator(':scope > .value').textContent(),percentage(sample.completed,sample.eligible));
  assert.equal(await metricCell('registration.'+action,sample.index).locator(':scope > .value').textContent(),percentage(sample.confirmed,sample.eligible));
  assert.match(await page.locator('[data-table-id="detail.'+action+'.verdict"] td').first().textContent(),/All readable reportable scans/);
  const activity=await page.evaluate(({action,index})=>{
   const day=window.__auditDashboard.days[index];
   return ['activity_all','verdict'].map(suffix=>{
    const metric=day.metrics['detail.'+action+'.'+suffix];
    return {numerator:metric.numerator,unavailable:(metric.counts.unavailable??0)===metric.denominator};
   });
  },{action,index:sample.index});
  assert.ok(activity[0].numerator>=activity[1].numerator);
  for(const [i,suffix] of ['activity_all','verdict'].entries()){
   assert.equal(await metricCell('detail.'+action+'.'+suffix,sample.index).locator(':scope > .value').textContent(),activity[i].unavailable?'Unavailable':percentage(activity[i].numerator,sample.eligible));
  }
 }
 checks.choiceStagePresentation=true;
 assert.equal(displayedEntries.length,await page.locator('#daily tbody tr[data-table-id]').count());
 const canonicalReject='sealed.choice_finding.california_post_reject_collection';
 const rejectCoverage=tableEntries.find(entry=>entry.id==='detail.reject.verdict');
 if(measureCatalog.entries.some(entry=>entry.id===canonicalReject)){
  assert.ok(rejectCoverage?.details.some(detail=>detail.id===canonicalReject));
  assert.equal(await page.locator('[data-table-id="'+canonicalReject+'"]').count(),0);
  const day=await page.evaluate(()=>window.__auditDashboard.days.findIndex(d=>d.date==='2026-11-08'&&d.reportable===51));
  if(day>=0){
   const detail=metricCell(canonicalReject,day);
   assert.equal(await detail.locator('.reject-cohort-counts').textContent(),'0 surfaced51 reportable scans4 completed Reject clicks');
   assert.match(await detail.locator('.reject-qualification').textContent(),/California assessment unavailable for 4 of 4 completed clicks/);
   assert.match(await detail.locator('.reject-qualification').textContent(),/Separate post-click observation verdicts/);
  }
 }
 assert.equal(await page.locator('#tableSummary').textContent(),displayedEntries.length+' measures');
 const missingHeadlines=()=>page.locator('#daily tbody tr[data-table-id]').evaluateAll(rows=>rows.flatMap(row=>
  Array.from(row.cells).slice(1).filter(cell=>cell.querySelectorAll(':scope > .value').length!==1||
   !cell.querySelector(':scope > .value').textContent.trim()).map(cell=>[row.dataset.tableId,cell.cellIndex])));
 assert.deepEqual(await missingHeadlines(),[]);
 const percentHeadlineErrors=()=>page.locator('#daily td > .value, #daily [data-supporting-id] > .value').evaluateAll(values=>
  values.flatMap(value=>{
   const text=value.textContent;
   if(!text.includes('%')||value.hasAttribute('data-checklist-verdict'))return [];
   const line=value.parentElement.querySelector(':scope > .state-percentages > [data-headline]');
   const subvalue=line?.querySelector('.state-line-value')?.textContent;
   const fraction=/^(\d+)\/(\d+)$/.exec(subvalue??'');
   const countRate=fraction?100*Number(fraction[1])/Number(fraction[2]):null;
   const matches=subvalue===text||(countRate!==null&&Math.abs(countRate-parseFloat(text))<=0.051);
   return /^\d+(?:\.\d+)?%$/.test(text)&&matches&&
    line?.querySelector('.state-line-label')?.textContent.trim().endsWith(':')?[]:[text];
  }));
 const wrappingStates=()=>page.locator('#daily .state-line').evaluateAll(lines=>lines.filter(line=>
  line.getClientRects().length>0&&(line.getBoundingClientRect().height>parseFloat(getComputedStyle(line).lineHeight)+1||
   line.querySelector('.state-line-value').getBoundingClientRect().right>line.getBoundingClientRect().right+1)).map(line=>line.textContent));
 assert.deepEqual(await percentHeadlineErrors(),[]);
 assert.deepEqual(await wrappingStates(),[]);
 const ambiguousBreakdowns=await page.locator('#daily .state-percentages').evaluateAll(groups=>groups.flatMap(group=>{
  const labels=[...group.querySelectorAll('.state-line-label')].map(label=>label.textContent.toLowerCase());
  return new Set(labels).size===labels.length?[]:[group.textContent];
 }));
 assert.deepEqual(ambiguousBreakdowns,[]);
 const shortRejectState=page.locator('#daily [data-state="no_eligible_nonessential_activity_observed_during_completed_window"]').first();
 if(await shortRejectState.count()){
  assert.match(await shortRejectState.textContent(),/^No eligible activity: \d+(?:\.\d)?%$/);
  assert.match(await shortRejectState.getAttribute('title'),/no eligible nonessential activity observed during completed window:/);
 }
 checks.compactTablePercentages=true;
 for(const removal of measureCatalog.removals)assert.equal(await page.locator('[data-table-id="'+removal.id+'"],#metric option[value="metric:'+removal.id+'"]').count(),0);
 const csvMetricIds=await page.evaluate(()=>window.__auditDashboard.data.csvMetrics.map(metric=>metric.id));
 for(const alias of measureCatalog.checklistAliases){
  assert.ok(!csvMetricIds.includes(alias.id));
  for(const id of alias.replacements)if(measureCatalog.entries.some(entry=>entry.id===id))assert.ok(csvMetricIds.includes(id));
 }
 for(const retired of measureCatalog.retired){assert.ok(!csvMetricIds.includes(retired.id));assert.equal(await page.locator('#metric option[value="metric:'+retired.id+'"]').count(),0);}
 for(const entry of measureCatalog.entries)assert.ok(entry.canonicalLinks.length&&entry.canonicalLinks.every(link=>link.recordType&&link.recordLabel&&link.basis));
 assert.equal(await page.locator('#daily .canonical-mapping').count(),tableEntries.length);checks.measureCatalog=true;
 assert.match(await page.locator('#trendTitle').textContent(),/Reject control presence/);assert.ok((await page.locator('#trend circle title').allTextContents()).every(s=>s.includes('public_export/')&&s.includes('/')));checks.chartTooltips=true;
 const bounds=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1);checks.desktop=true;
 const quantityExamples=await page.evaluate(()=>{
  const {data,days}=window.__auditDashboard;
  const quantities=data.measureCatalog.entries.filter(entry=>entry.kind==='quantity');
  const missingSubjects=quantities.filter(entry=>!['ms','milliseconds'].includes(entry.unit)&&!data.quantitySubjects[entry.id]);
  if(missingSubjects.length)throw Error('Count headlines need subjects: '+missingSubjects.map(entry=>entry.id).join(', '));
  const displayedIds=new Set(data.measureCatalog.tableEntries.flatMap(entry=>[entry.id,...entry.details.map(detail=>detail.id)]));
  return days.flatMap((day,index)=>quantities.filter(entry=>displayedIds.has(entry.id)).map(entry=>{
   const value=day.quantities[entry.id];
   const groups=Object.values(value.series).filter(group=>group.measured>0);
   const source=groups[0];
   const timing=['ms','milliseconds'].includes(entry.unit);
   let title='Separate measurement groups';
   if(!value.eligible)title='No eligible data';
   else if(!value.measured)title='Unavailable';
   else if(timing&&value.median!==null)title=value.median.toFixed(1)+' '+entry.unit;
   else if(!timing&&groups.length===1){
    const percent=100*source.nonzero/source.measured;
    title=(Number.isInteger(percent)?percent:percent.toFixed(1))+'%';
   }
   const estimate=value.eligible>0&&!value.measured&&
    (day.date>='2026-10-09'&&day.date<='2026-10-22'||day.date>='2026-11-02'&&day.date<='2026-11-05')
    ? {'technology.detections':'17.5%','technology.matches':'0.25%'}[entry.id]:undefined;
   return {id:entry.id,index,title:estimate??title,estimate};
  }));
 });
 const actualQuantityTitles=await page.locator('#daily').evaluate(table=>{
  const titles={};
  for(const row of table.querySelectorAll('tr[data-table-id]')){
   Array.from(row.cells).slice(1).forEach((cell,index)=>{
    if(row.dataset.tableKind==='quantity')titles[row.dataset.tableId+':'+index]=cell.querySelector(':scope > .value')?.textContent;
    for(const child of cell.querySelectorAll('[data-supporting-id]')){
     titles[child.dataset.supportingId+':'+index]=child.querySelector(':scope > .value')?.textContent;
    }
   });
  }
  return titles;
 });
 for(const {id,index,title} of quantityExamples)assert.equal(actualQuantityTitles[id+':'+index],title,id+' day '+index);
 const estimatedExamples=quantityExamples.filter(example=>example.estimate);
 assert.equal(await page.locator('[data-technology-estimate]').count(),estimatedExamples.length);
 for(const {id,index,estimate} of estimatedExamples){
  const cell=metricCell(id,index);
  assert.equal(await cell.locator(':scope > .state-percentages > [data-headline]').textContent(),'Estimate: '+estimate);
  assert.match(await cell.textContent(),/0 measured that day/);
 }
 if(estimatedExamples.length){
  await page.selectOption('#origin','verified');
  assert.equal(await page.locator('[data-technology-estimate]').count(),0);
  await page.selectOption('#origin','all');
  const dates=await page.evaluate(()=>window.__auditDashboard.days.map(day=>day.date));
  for(const id of new Set(estimatedExamples.map(example=>example.id))){
   const expected=estimatedExamples.filter(example=>example.id===id);
   await page.locator('[data-table-id="'+id+'"] .chart-button').click();
   const graph=page.locator('#popoverGraph');
   const points=graph.locator('[data-technology-estimate-date]');
   assert.deepEqual(await points.evaluateAll(nodes=>nodes.map(node=>node.dataset.technologyEstimateDate)),
    expected.map(example=>dates[example.index]));
   assert.ok((await points.locator('title').allTextContents()).every(label=>label.includes('Estimate '+expected[0].estimate)&&label.includes('0 measured')));
   const segments=[];
   for(const {index} of expected){
    if(segments.at(-1)?.at(-1)===index-1)segments.at(-1).push(index);
    else segments.push([index]);
   }
   const lines=graph.locator('[data-technology-estimate-line]');
   assert.deepEqual(await lines.evaluateAll(nodes=>nodes.map(line=>[line.getAttribute('stroke-dasharray'),line.getAttribute('points').split(' ').length])),
    segments.filter(segment=>segment.length>1).map(segment=>['7 4',segment.length]));
   assert.equal(await page.locator('#popoverLegend [data-technology-estimate-legend]').textContent(),'Estimate (dashed) · '+expected[0].estimate);
   await page.selectOption('#popoverState','__median__');
   assert.equal(await points.count(),0);
   await page.selectOption('#popoverState','__primary__');
   await page.selectOption('#popoverSource',{index:1});
   assert.equal(await points.count(),0);
   await page.selectOption('#popoverSource','all');
   assert.equal(await points.count(),expected.length);
   await page.locator('#closeChartPopover').click();
  }
  await page.selectOption('#origin','verified');
  assert.equal(await page.locator('#trend [data-technology-estimate-date]').count(),0);
  await page.selectOption('#origin','all');
  await page.locator('[data-table-id="control.reject"] .chart-button').click();
  await page.locator('#closeChartPopover').click();
 }
 checks.technologyEstimates=true;
 checks.technologyEstimateCharts=true;
 const policyPresentation=await page.evaluate(()=>{
  const {days,data}=window.__auditDashboard;
  const transfer='checklist.outdated_transfer_framework_reference',receipt='sealed.operations.policy_text_receipt';
  return days.flatMap((day,index)=>[transfer,receipt].flatMap(id=>{
   const metric=day.metrics[id];
   if(!data.tableEntries.some(entry=>entry.id===id)||!metric?.denominator)return [];
   const missing=metric.counts.unavailable??0;
   const check=day.metrics['sealed.operations.transfer_framework_check'];
   const checkCounts=check?.counts??{};
   return [{index,id,eligible:metric.denominator,missing,signals:metric.counts.partial_concern??0,
    complete:metric.counts.producer_verified_complete_receipt??0,limited:metric.counts.producer_verified_limited_receipt??0,
    explicitNoReceipt:metric.counts.no_verified_receipt_in_projection??0,
    verifiedLocal:day.metrics['sealed.policy_full_text']?.counts.verified_full_text??0,
    checkDenominator:check?.denominator??metric.denominator,unknownChecks:check?(checkCounts.unavailable??0):metric.denominator,
    completedChecks:(checkCounts.checked_no_signal??0)+(checkCounts.checked_review_signal??0),
    completedSignals:checkCounts.checked_review_signal??0,
    inconclusive:(checkCounts.inconclusive_policy_coverage??0)+(checkCounts.inconclusive_matcher_limit??0),
    noText:checkCounts.not_assessed_no_eligible_text??0}];
  }));
 });
 const periodTotals={eligible:0,signals:0,completedChecks:0,completedSignals:0,inconclusive:0,noText:0,unknownChecks:0};
 for(const {index,id,eligible,missing,signals,complete,limited,explicitNoReceipt,verifiedLocal,
  checkDenominator,unknownChecks,completedChecks,completedSignals,inconclusive,noText} of policyPresentation){
  const cell=metricCell(id,index);
  if(id.startsWith('checklist.')){
   const headline=unknownChecks===checkDenominator?'Completed checks unknown':
    completedChecks+' of '+eligible+' checks completed'+
     (completedChecks?' · '+completedSignals+' '+(completedSignals===1?'signal':'signals')+' found':'');
   assert.equal(await cell.locator(':scope > .value').textContent(),headline);
   assert.equal(await cell.locator('[data-transfer-signal-coverage]').textContent(),
    signals+' of '+eligible+' reports flagged a reference for review');
   const coverage=await cell.locator('[data-transfer-assessment-coverage]').textContent();
   for(const detail of [
    (completedChecks-completedSignals)+' completed · no outdated reference detected in the policy text checked',
    completedSignals+' completed · outdated reference flagged for review',
    inconclusive+' inconclusive · policy coverage incomplete or matcher limit reached',
    noText+' not assessed · no eligible policy text',
    unknownChecks+' assessment unavailable · completion could not be verified',
   ])assert.ok(coverage.includes(detail),detail);
   for(const [key,value] of Object.entries({eligible,signals,completedChecks,completedSignals,inconclusive,noText,unknownChecks}))
    periodTotals[key]+=value;
  }else{
   if(missing===eligible)assert.equal(await cell.locator(':scope > .value').textContent(),'Coverage unavailable');
   const note=await cell.locator('[data-policy-receipt-coverage]').textContent();
   assert.ok(note.includes((eligible-missing)+'/'+eligible+' reportable scans with a producer receipt result'));
   assert.ok(note.includes(complete+' complete · '+limited+' limited · '+explicitNoReceipt+' explicitly without a verified receipt'));
   if(verifiedLocal)assert.ok(note.includes('Separate local text verification · '+verifiedLocal+' complete'));
  }
 }
 if(periodTotals.eligible){
  const period=page.locator('[data-transfer-period]');
  assert.equal(await period.locator('[data-transfer-period-signals]').textContent(),
   periodTotals.signals+' of '+periodTotals.eligible+' reports flagged a reference for review');
  const summary=await period.textContent();
  assert.ok(summary.includes(periodTotals.inconclusive+' inconclusive'));
  assert.ok(summary.includes(periodTotals.unknownChecks+' assessment unavailable'));
  assert.ok(summary.includes(periodTotals.noText+' not assessed'));
  assert.ok(summary.includes((periodTotals.completedChecks-periodTotals.completedSignals)+' completed · no outdated reference detected'));
 }
 const headlineCoverage=await page.evaluate(()=>{
  const {data,days}=window.__auditDashboard;
  const review=['gap_observed','review_signal','observed','not_observed'];
  const rows=[
   ['detail.reject.verdict','verdict.post_reject_tracking_reduction',review,'had a review outcome'],
   ['sealed.checklist.cross_border_endpoint_review','sealed.verdict.cross_border_endpoint_review',review,'had a review outcome'],
   ['sealed.checklist.accessibility_consent_controls','sealed.verdict.accessibility_consent_controls',['gap_observed','review_signal','not_observed'],'had a test result'],
   ['sealed.operations.policy_text_receipt','sealed.operations.policy_text_receipt',['producer_verified_complete_receipt','producer_verified_limited_receipt'],'had verified receipts'],
  ];
  return rows.flatMap(([id,source,states,suffix])=>{
   if(!data.tableEntries.some(entry=>entry.id===id))return [];
   return days.flatMap((day,index)=>{
    const value=day.metrics[source];
    if(!value?.denominator)return [];
    const covered=states.reduce((sum,state)=>sum+(value.counts[state]??0),0);
    const missing=(value.counts.unknown??0)+(value.counts.unavailable??0);
    return [{id,index,expected:missing===value.denominator?'Coverage unavailable':
     covered+' of '+value.denominator+' '+suffix,counts:value.counts}];
   });
  });
 });
 for(const {id,index,expected,counts} of headlineCoverage){
  const reduction=id==='detail.reject.verdict';
  const outer=metricCell(id,index);
  const cell=reduction?outer.locator('[data-reject-reduction-coverage]'):outer;
  assert.equal(await cell.locator(':scope > .value').textContent(),(reduction?'Tracking reduction after Reject · ':'')+expected,id);
  for(const [state,count] of Object.entries(counts)){
   assert.equal(await cell.locator(':scope > .checklist-verdicts [data-state="'+state+'"] .state-line-value').textContent(),String(count),id);
  }
 }
 checks.policyEvidenceAvailability=true;
 const mixedTransferCoverage=await page.evaluate(()=>{
  const {data,days}=window.__auditDashboard;
  const date=days.find(day=>day.reportable>=3)?.date;
  const refresh=()=>document.getElementById('origin').dispatchEvent(new Event('change'));
  if(!date)return null;
  const index=days.findIndex(day=>day.date===date);
  const field='sealed.operations.transfer_framework_check';
  const reasonsField='sealed.operations.transfer_framework_reasons';
  const supplementField='sealed.operations.transfer_supplement_disposition';
  const bits=data.transferFrameworkReasonBits;
  const dayOf=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
  const cohort=data.rows.filter(row=>row.reportable&&dayOf.format(new Date(row.createdAt))===date);
  const original=cohort.map(row=>[row.states[field],row.states[reasonsField],row.states[supplementField]]);
  const addMetric=!data.metrics.some(metric=>metric.id===field);
  if(addMetric)data.metrics.push({id:field,success:['checked_no_signal','checked_review_signal']});
  try {
   cohort.forEach((row,i)=>{
    row.states[field]=['checked_no_signal','checked_review_signal','partial_review_signal'][i]??'unavailable';
    row.states[reasonsField]=['reason_mask_0',undefined,'reason_mask_'+(bits.policy_evidence_lane_degraded|bits.projected_document_not_checked|bits.unresolved_material_policy_supplements)][i]??'unavailable';
    row.states[supplementField]=i===2?'supplement_mask_'+(data.policySupplementBits.skipped_budget|data.policySupplementBits.fetched_without_eligible_match):'unavailable';
   });
   refresh();
   const cell=document.querySelector('[data-table-id="checklist.outdated_transfer_framework_reference"]').cells[index+1];
   return {text:cell.querySelector('[data-transfer-assessment-coverage]').textContent,eligible:cohort.length};
  } finally {
   cohort.forEach((row,i)=>[field,reasonsField,supplementField].forEach((key,j)=>{
    if(original[i][j]===undefined)delete row.states[key];else row.states[key]=original[i][j];
   }));
   if(addMetric)data.metrics.pop();
   refresh();
  }
 });
 if(mixedTransferCoverage){
  assert.ok(mixedTransferCoverage.text.includes('1 completed · outdated reference flagged for review'));
  assert.ok(mixedTransferCoverage.text.includes('1 flagged for review with partial policy coverage'));
  assert.ok(mixedTransferCoverage.text.includes((mixedTransferCoverage.eligible-3)+' assessment unavailable'));
  assert.ok(mixedTransferCoverage.text.includes('Completion reason detail 2/'+mixedTransferCoverage.eligible+' · '+(mixedTransferCoverage.eligible-2)+' unavailable'));
  assert.ok(mixedTransferCoverage.text.includes('policy evidence lane degraded: 1'));
  assert.ok(mixedTransferCoverage.text.includes('projected document not checked: 1'));
  assert.ok(mixedTransferCoverage.text.includes('Supplement disposition 1/1 · 0 unavailable'));
  assert.ok(mixedTransferCoverage.text.includes('skipped budget: 1'));
  assert.ok(mixedTransferCoverage.text.includes('fetched without eligible match: 1'));
 }
 checks.transferFrameworkAssessment=true;
 await page.setViewportSize({width:826,height:680});
 const tableLayout=await page.locator('.report-table-heading').evaluate(heading=>{
  const title=heading.querySelector('h2').getBoundingClientRect();
  const count=heading.querySelector('#tableSummary').getBoundingClientRect();
  const table=heading.nextElementSibling;
  const note=table.querySelector('details.coverage-note > summary');
  const meaning=table.querySelector('.metric-meaning');
  return {countAtRight:count.left>=title.right&&count.top<title.bottom,
   maxHeight:parseFloat(getComputedStyle(table).maxHeight),
   summaryOneLine:note.getBoundingClientRect().height<=parseFloat(getComputedStyle(note).lineHeight)+1,
   meaningClamp:getComputedStyle(meaning).webkitLineClamp};
 });
 assert.equal(tableLayout.countAtRight,true);
 assert.ok(Math.abs(tableLayout.maxHeight-680*.92)<1);
 assert.equal(tableLayout.summaryOneLine,true);
 assert.equal(tableLayout.meaningClamp,'4');
 const dayHeaders=await page.locator('#daily thead .day-header').evaluateAll(headers=>headers.map(header=>{
  const [date,count]=header.children;
  return {date:date.textContent,count:count.textContent,lines:header.childElementCount,
   stacked:count.getBoundingClientRect().top>=date.getBoundingClientRect().bottom,
   coverage:header.title};
 }));
 assert.deepEqual(dayHeaders,await page.evaluate(()=>window.__auditDashboard.days.map(day=>({
  date:day.date,count:day.reportable+' of '+day.attempts,lines:2,stacked:true,
  coverage:(day.completeDay?'Complete day':'Partial day')+' · '+(day.inventoryHours>0?day.inventoryHours.toFixed(1)+'h complete inventory':'Attempt inventory incomplete'),
 }))));
 const receiptNote=page.locator('#daily [data-policy-receipt-coverage]').last();
 assert.equal(await receiptNote.evaluate(note=>note.open),false);
 await receiptNote.locator('summary').click();
 assert.equal(await receiptNote.locator(':scope > div').isVisible(),true);
 await receiptNote.locator('summary').click();
 await page.setViewportSize({width:1440,height:1000});
 checks.compactReportTable=true;
 const accessibilityExample=await page.evaluate(()=>window.__auditDashboard.days.findIndex(day=>
  day.date==='2026-11-07'&&day.quantities['accessibility.failed_rules'].total===115&&day.quantities['accessibility.failed_rules'].measured===50));
 if(accessibilityExample>=0){
  const failed=metricCell('accessibility.failed_rules',accessibilityExample);
  assert.equal(await failed.locator(':scope>.value').textContent(),'80%');
  assert.equal(await failed.locator(':scope > .state-percentages > [data-headline]').textContent(),'With failed rules: 80%');
  assert.match(await failed.locator(':scope > details.series-list:not(.supporting-evidence)').textContent(),/40\/50 measured reports.*Total 115 rules.*Median 2.0/);
  assert.equal(await metricCell('accessibility.review_rules',accessibilityExample).locator(':scope>.value').textContent(),'96%');
 }
 await page.locator('[data-table-id="accessibility.failed_rules"] .chart-button').click();
 assert.match(await page.locator('#chartPopoverTitle').textContent(),/measured reports with failed rules/);
 assert.ok((await page.locator('#popoverGraph circle title').allTextContents()).some(title=>title.includes('% of measured reports with failed rules')));
 await page.locator('#popoverState').selectOption('__median__');
 assert.match(await page.locator('#chartPopoverTitle').textContent(),/median rules/);
 await page.locator('#closeChartPopover').click();
 checks.quantityTotals=true;
 const rateExamples=await page.evaluate(()=>{
  const dashboard=window.__auditDashboard;
  return ['metrics','findings'].map(kind=>dashboard.days.flatMap((day,index)=>
   Object.entries(day[kind]).filter(([id,v])=>dashboard.data.tableEntries.some(entry=>entry.id===id)&&id!=='customer_cmp_check.prominence'&&id!=='checklist.outdated_transfer_framework_reference'&&id!=='sealed.operations.policy_text_receipt'&&id!=='checklist.post_reject_tracking_reduction'&&!dashboard.data.verdictLayouts[id]&&!/^(?:sealed\.)?(?:execution|click|registration)\./.test(id)&&!/^detail\.(accept|reject)\.(activity_all|verdict)$/.test(id)&&!['control.accept','control.reject'].includes(id)&&id!=='sealed.choice_evidence.paired_cmp'&&!['gpc_delivery','detail.gpc.session_collection','detail.gpc.california_collection','detail.gpc.cmp_receipt'].includes(id)&&v.source==='mixed_sources'&&Object.values(v.series).some(p=>Number.isFinite(p.rate))&&
    (kind==='findings'||Object.keys(v.counts).some(state=>state!=='unknown'&&state!=='unavailable'))&&
    (!/^(?:customer_cmp_check|sealed\.cmp_check)\./.test(id)||
     Object.keys(v.counts).some(state=>!['not_assessed','incomplete','partially_assessed','unavailable'].includes(state))))
    .map(([id])=>({id,index,kind:kind==='findings'?'finding':'metric'}))).at(-1)).filter(Boolean);
 });
 for(const {id,index,kind} of rateExamples){
  const cell=page.locator(`[data-table-kind="${kind}"][data-table-id="${id}"] td`).nth(index+1);
  assert.match(await cell.locator(':scope>.value').textContent(),/^\d+(?:\.\d)?%$/,id);
  // The dedicated policy coverage assertions above verify these panels.
  const unexpectedMinor=cell.locator(':scope>.minor:not(.state-percentages):not([data-policy-receipt-coverage]):not([data-transfer-signal-coverage]):not([data-transfer-assessment-coverage])');
  assert.equal(await unexpectedMinor.count(),0);
  assert.match(await cell.locator(':scope > details.series-list:not(.supporting-evidence) > summary').textContent(),/Separate sources/);
  assert.equal(await cell.locator(':scope > details.series-list:not(.supporting-evidence)').evaluate(details=>details.open),false);
  const source=cell.locator(':scope > details.series-list:not(.supporting-evidence) .series-entry').filter({hasText:'Shown above'});
  assert.equal(await source.count(),1);
  assert.ok((await source.locator('strong').textContent()).includes('/'));
  assert.equal(await source.isVisible(),false);
  await cell.locator(':scope > details.series-list:not(.supporting-evidence) > summary').click();
  assert.equal(await source.isVisible(),true);
  await cell.locator(':scope > details.series-list:not(.supporting-evidence) > summary').click();
 }
 assert.ok(await page.locator('#daily td > .value').filter({hasText:/^100%$/}).count()>0);
 const percentages=(cell)=>cell.locator(':scope > .state-percentages > [data-state]').allTextContents();
 const gpcDeliveryDay=await page.evaluate(()=>window.__auditDashboard.days.findIndex(day=>day.date==='2026-11-08'&&
  day.metrics.gpc_delivery.denominator===51&&day.metrics.gpc_delivery.counts.verified===50));
 if(gpcDeliveryDay>=0){
  const cell=metricCell('gpc_delivery',gpcDeliveryDay);
  assert.equal(await cell.locator(':scope > .value').textContent(),'98.0%');
  assert.deepEqual(await percentages(cell),['Verified: 50/51','unavailable: 2.0%']);
  assert.match(await cell.locator(':scope > details.series-list:not(.supporting-evidence)').textContent(),/Verified: 50\/51/);
 }
 const example=await page.evaluate(()=>{
  const {days}=window.__auditDashboard;
  return days.findIndex(day=>day.date==='2026-11-07'&&day.metrics.outcome.denominator===73&&
   day.metrics.outcome.counts.usable_limited===49&&day.metrics.outcome.counts.usable_complete===2&&
   day.metrics.outcome.counts.export_unavailable===3&&day.metrics['control.reject'].denominator===51&&
   day.metrics['control.reject'].counts.observed===5);
 });
 if(example>=0){
  const outcome=page.locator('[data-table-id="outcome"] td').nth(example+1);
  assert.equal(await outcome.locator(':scope > .value').textContent(),'72.9%');
  assert.deepEqual(await percentages(outcome),['Observed: 72.9%','limited: 67.1%','complete: 2.7%','unavailable: 4.1%']);
  assert.match(await outcome.locator(':scope > details.series-list:not(.supporting-evidence)').textContent(),/no go: 19\/73/);
  for(const id of ['control.accept','control.reject']){
   const cell=metricCell(id,example);
   const outcomes=await percentages(cell);
   assert.equal(outcomes[0],'observed: 5/51');
   assert.ok(outcomes.includes('unknown: 31.4%'));
  }
  for(const [id,title,count,state] of [
   ['execution.accept','Confirmed: 4.3%','Confirmed: 3/70','succeeded_with_confirmation'],
   ['execution.reject','Confirmed: 2.9%','Confirmed: 2/70','succeeded_with_confirmation'],

   ['checklist.outdated_transfer_framework_reference','Partial concern: 2.0%','Partial concern: 1/51','partial_concern'],
  ]){
   const cell=metricCell(id,example);
   assert.equal(await cell.locator(':scope > .value').textContent(),title.split(': ')[1]);
   assert.equal(await cell.locator(':scope > .state-percentages > [data-state="'+state+'"]').textContent(),title);
   assert.ok((await cell.locator('details').allTextContents()).join(' ').includes(count.split(': ')[1]),count);
  }
  assert.match(await metricCell('execution.reject',example).locator('details').textContent(),/4\/5 ·/);
 }
 const mixedOutcome=await page.evaluate(()=>window.__auditDashboard.days.findIndex(day=>day.date==='2026-11-06'&&
  day.metrics.outcome.denominator===199&&day.metrics.outcome.counts.export_unavailable===15));
 if(mixedOutcome>=0){
  const cell=page.locator('[data-table-id="outcome"] td').nth(mixedOutcome+1);
  assert.equal(await cell.locator(':scope > .value').textContent(),'74.5%');
  assert.equal(await cell.locator(':scope > .state-percentages > [data-headline]').textContent(),'Observed: 74.5%');
  assert.match(await cell.locator(':scope > details.series-list:not(.supporting-evidence) .series-entry').filter({hasText:'Shown above'}).locator('strong').textContent(),/^public_export\//);
 }
 const lastDay=await page.evaluate(()=>window.__auditDashboard.days.length);
 const unretained=metricCell('sealed.terminal.audit_accept',lastDay-1);
 assert.ok(await unretained.locator(':scope>.value').textContent());
 checks.availability=true;
 await page.screenshot({path:path.join(root,'desktop.png'),fullPage:true});
 for(const [button,name]of [['csv','daily-metrics.csv'],['quantityCsv','daily-volumes.csv'],['findingCsv','daily-findings.csv']]){const wait=page.waitForEvent('download');await page.locator('#'+button).click();const dl=await wait;const temp=path.join(root,'browser-'+name);await dl.saveAs(temp);assert.equal(await fs.readFile(temp,'utf8'),await fs.readFile(path.join(root,name),'utf8'));await fs.unlink(temp);}checks.csvParity=true;
 const regions=await page.locator('#region option').evaluateAll(opts=>opts.map(o=>o.value));if(regions.length>1){await page.selectOption('#region',regions[1]);await assertDataHealth();assert.equal(await page.evaluate(()=>window.__auditDashboard.currentRows().every(r=>r.region===document.getElementById('region').value)),true);const content=await page.evaluate(()=>window.__auditDashboard.engine.stateCsv(window.__auditDashboard.days,window.__auditDashboard.data.csvMetrics));const wait=page.waitForEvent('download');await page.locator('#csv').click();const dl=await wait,temp=path.join(root,'filtered.csv');await dl.saveAs(temp);assert.equal(await fs.readFile(temp,'utf8'),content);await fs.unlink(temp);await page.selectOption('#region','all');}
 const providers=await page.locator('#cmp option').evaluateAll(opts=>opts.map(o=>o.value));if(providers.length>1){await page.selectOption('#cmp',providers[1]);assert.equal(await page.evaluate(()=>window.__auditDashboard.currentRows().every(r=>r.states.cmp_provider===document.getElementById('cmp').value)),true);await page.selectOption('#cmp','all');}
 await page.selectOption('#origin','selection');assert.equal(await page.evaluate(()=>window.__auditDashboard.currentRows().every(r=>r.originProof==='production_id_selection_only'&&r.reportable===false)),true);await page.selectOption('#origin','all');
 await page.selectOption('#group','Controls');assert.equal(await page.locator('#daily tbody tr[data-table-id]').count(),2);checks.filters=true;
 assert.equal(await page.locator('[data-table-id="control.privacyOptOut"]').count(),0);
 assert.equal(await page.locator('#metric option[value="metric:control.privacyOptOut"]').count(),0);
 const retainedOptOut=page.locator('[data-table-id="sealed.control.privacyOptOut"]');
 assert.match(await retainedOptOut.textContent(),/Opt-out control presence/);
 const positive=await page.evaluate(()=>window.__auditDashboard.days.reduce((n,d)=>n+(d.metrics['sealed.control.privacyOptOut'].counts.observed??0),0));
 if(positive>0)assert.match(await retainedOptOut.textContent(),/observed:/);
 checks.optOutCoverage=true;
 await page.selectOption('#group','Opt-out');
 assert.equal(await page.locator('[data-table-id="sealed.opt_out.dispatch"]').count(),0);
 const dispatch=page.locator('[data-table-id="sealed.opt_out.action_completion"] [data-supporting-id="sealed.opt_out.dispatch"]');
 assert.equal(await dispatch.count(),await page.evaluate(()=>window.__auditDashboard.days.length));
 assert.match(await dispatch.first().textContent(),/Effective opt-out dispatch status/);
 for(const state of ['excluded_by_profile','dispatch_recorded','conditional_no_dispatch_recorded','profile_dispatch_conflict']){
  const expected=await page.evaluate(state=>window.__auditDashboard.days.map(d=>{
   const {counts,denominator}=d.metrics['sealed.opt_out.dispatch'];
   if(state==='dispatch_recorded'){
    if(!Object.keys(counts).some(k=>k!=='unavailable'&&k!=='unknown'))return null;
    const value=100*(counts[state]??0)/denominator;
    return 'Dispatch recorded: '+(Number.isInteger(value)?String(value):value.toFixed(1))+'%';
   }
   if(!Object.hasOwn(counts,state))return null;
   const value=100*counts[state]/denominator;
   return state.replaceAll('_',' ')+': '+(Number.isInteger(value)?String(value):value.toFixed(1))+'%';
  }),state);
  const actual=await dispatch.evaluateAll((cells,state)=>cells.map(cell=>{
   return cell.querySelector(':scope > .state-percentages > [data-state="'+state+'"]')?.textContent??null;
  }),state);
  assert.deepEqual(actual,expected,state);
 }
 checks.optOutDispatch=true;
 const funnel=page.locator('[data-table-id="sealed.opt_out.action_completion"]');
 assert.match(await funnel.locator('.metric-name strong').textContent(),/^Opt-out execution and verification$/);
 for(const id of ['sealed.opt_out.dispatch','sealed.opt_out.coverage','sealed.opt_out.configured','sealed.opt_out.conditional_control','sealed.opt_out.supported_route','sealed.opt_out.dispatch_reason','sealed.opt_out.choice_confirmation','sealed.opt_out.post_confirmation_observation']){
  assert.equal(await page.locator('[data-table-id="'+id+'"]').count(),0);
  assert.ok(tableEntries.find(e=>e.id==='sealed.opt_out.action_completion').details.some(e=>e.id===id));
  assert.ok(csvMetricIds.includes(id));
 }
 const dispatchDetails=funnel.locator('td').last().locator(':scope > .supporting-evidence');
 await dispatchDetails.locator(':scope > summary').click();
 await dispatch.last().locator('button.supporting-chart').click();
 await page.selectOption('#popoverState','dispatch_recorded');
 assert.equal(await page.locator('#popoverState').inputValue(),'dispatch_recorded');
 assert.match(await page.locator('#chartPopoverTitle').textContent(),/Effective opt-out dispatch status/);
 await page.locator('#closeChartPopover').click();
 await dispatchDetails.locator(':scope > summary').click();
 const funnelDay=await page.evaluate(()=>window.__auditDashboard.days.findIndex(d=>d.date==='2026-11-09'&&d.reportable===90));
 if(funnelDay>=0){
  const cell=funnel.locator('td').nth(funnelDay+1);
  assert.equal(await cell.locator(':scope > .value').textContent(),'Not tested · 0 dispatched');
  assert.match(await cell.locator('.opt-out-blockers').textContent(),/No qualifying control recorded in dispatch source: 22/);
  assert.match(await cell.locator('.opt-out-blockers').textContent(),/Control recorded, no supported route: 4/);
  await cell.locator('.opt-out-stages > summary').focus();await page.keyboard.press('Enter');
  assert.equal(await cell.locator('.opt-out-stages').evaluate(e=>e.open),true);
  assert.match(await cell.locator('.opt-out-stages').textContent(),/rates are not calculated/);
  await cell.locator('.opt-out-stages > summary').click();
 }
 await page.selectOption('#origin','selection');
 assert.ok((await funnel.locator('td > .value').allTextContents()).every(v=>v==='No eligible data'));
 await page.selectOption('#origin','all');
 await funnel.locator('.chart-button').click();assert.equal(await page.locator('#popoverState').inputValue(),'completed');
 assert.match(await page.locator('#chartPopoverTitle').textContent(),/completed share/);
 await page.locator('#closeChartPopover').click();
 checks.optOutFunnel=true;
 const rejectionPreview=await page.evaluate(()=>{
  const {data,days}=window.__auditDashboard;
  const row=data.rows.find(r=>r.reportable&&r.states['sealed.opt_out.dispatch']==='conditional_no_dispatch_recorded');
  if(!row)return null;
  const prior=row.optOutRejection;
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.createdAt));
  const index=days.findIndex(d=>d.date===day),counts=Array(14).fill(0);counts[12]=1;
  try{
   row.optOutRejection={sourceSha256:'a'.repeat(64),receipt:[1,1,1,1,4,counts,[[0,0,12,2]]]};
   document.getElementById('origin').dispatchEvent(new Event('change'));
   const cell=document.querySelector('[data-table-id="sealed.opt_out.action_completion"]').querySelectorAll('td')[index+1];
   return cell.querySelector('.opt-out-rejection-details').textContent;
  }finally{
   if(prior===undefined)delete row.optOutRejection;else row.optOutRejection=prior;
   document.getElementById('origin').dispatchEvent(new Event('change'));
  }
 });
 if(rejectionPreview!==null){
  assert.match(rejectionPreview,/Observation 0 \/ control 0: Selector not supported by matching recipe/i);
  assert.match(rejectionPreview,/Native alternative checks: Native opt out binding missing/i);
  assert.match(rejectionPreview,/sample limit/);assert.ok(rejectionPreview.includes('a'.repeat(64)));
 }
 checks.optOutRejectionDetails=true;
 await page.selectOption('#group','Accept & Reject');
 assert.deepEqual(await page.locator('#daily tbody tr[data-table-id]').evaluateAll(rows=>rows.map(row=>row.dataset.tableId)),choiceRows.map(entry=>entry.id));
 const icon=page.locator('[data-chart-id="control.reject"]');await icon.click();await page.waitForSelector('#chartPopover:not([hidden])');assert.match(await page.locator('#chartPopoverTitle').textContent(),/presence/);assert.ok(await page.locator('#contract').textContent());await page.screenshot({path:path.join(root,'desktop-chart.png'),fullPage:true});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await icon.click();const rect=await page.locator('#chartPopover').boundingBox();assert.ok(rect&&rect.x>=0&&rect.x+rect.width<=391&&rect.y>=0&&rect.y+rect.height<=845);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);assert.deepEqual(await wrappingStates(),[]);await page.screenshot({path:path.join(root,'mobile-chart.png'),fullPage:true});checks.mobile=true;
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
 await page.keyboard.press('Escape');
 const coveragePanel=page.locator('details.panel').filter({has:page.locator('#coverageMap')});
 await coveragePanel.locator('summary').click();
 for(const viewport of [{width:1440,height:1100},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(const [kind,count]of [['report_box',13],['audit_only',6]]){
   const group=page.locator(`[data-coverage-group="${kind}"]`),sections=group.locator(':scope > section');
   assert.equal(await sections.count(),count);
   assert.deepEqual(await sections.locator('h4').allTextContents(),await page.evaluate(kind=>window.__auditDashboard.data.coverageMap.filter(c=>c.kind===kind).map(c=>c.box),kind));
   for(const section of await sections.all()){
    const labels=await section.locator('strong').allTextContents();
    assert.ok(labels.includes('Additions to audit coverage:')&&labels.includes('Remaining gaps:'));
    assert.equal(labels.includes('Shown in the scan report:'),kind==='report_box');
   }
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);
  await coveragePanel.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,`coverage-${viewport.width}.png`)});
 }
 checks.coverageMap=true;
 const expectedMatrix=await page.evaluate(()=>window.__auditDashboard.data.coverageMatrix);
 assert.equal(await page.locator('main > .panel').first().getAttribute('id'),'dataHealth');
 assert.equal(await page.locator('#coverageComparison').evaluate(e=>e.tagName),'DETAILS');
 assert.equal(await page.locator('#coverageComparison').evaluate(e=>e.open),false);
 await page.locator('#coverageComparison > summary').click();
 assert.equal(await page.locator('#coverageComparison').evaluate(e=>e.open),true);
 const allCatalogItems=expectedMatrix.domains.flatMap(a=>a.items);
 assert.match(await page.locator('#mappingCoverageSummary').textContent(),/Summary-only and omitted routes are not exact parity passes/);
 await page.locator('#catalogGuidance > summary').click();
 assert.equal(await page.locator('#catalogGuidanceItems strong').count(),expectedMatrix.masterCatalog.valueMappings.guidance.length+(expectedMatrix.review.forwardUtility??[]).length);
 assert.match(await page.locator('#catalogGuidanceItems').textContent(),/Export-file changes are not equivalent/);
 assert.match(await page.locator('#catalogGuidanceItems').textContent(),/Forward gap utility review/);
 for(const id of ['consent.cmp.criterion.banner','consent.cmp.criterion.reject','consent.cmp.criterion.privacy_link'])assert.equal(await page.locator('[data-matrix-item="'+id+'"] [data-coverage-column="audit"] .gap-review[data-resolution] > summary').textContent(),'Normalized · existing evidence');
 for(const id of ['collection.field.input_type','collection.field.required','collection.field.state'])assert.equal(await page.locator('[data-matrix-item="'+id+'"] [data-coverage-column="audit"] .gap-review[data-resolution] > summary').textContent(),'Context · form field record');
 assert.equal(Object.keys(await page.evaluate(()=>window.__auditDashboard.data.masterValueParity.contextValues)).length,10);
 await page.locator('#catalogGuidance > summary').click();
 assert.equal(await page.locator('#coverageGrouping').inputValue(),'concepts');
 assert.equal(expectedMatrix.masterCatalog.version,'certscore.evidence-master-catalog.v2');
 assert.equal(expectedMatrix.masterCatalog.compatibility.entries.length,231);
 assert.equal(expectedMatrix.masterCatalog.sourceReview.sources.length,41);checks.masterCatalog=true;
 assert.match(await page.locator('#masterParitySummary').textContent(),/comparable values/);assert.equal(await page.locator('.master-value-check').count(),4*231);const parityWait=page.waitForEvent('download');await page.locator('#masterParityDownload').click();const parityDl=await parityWait;const parityTemp=path.join(root,'browser-master-parity.json');await parityDl.saveAs(parityTemp);const parityData=JSON.parse(await fs.readFile(parityTemp,'utf8'));assert.deepEqual(parityData.parity,await page.evaluate(()=>window.__auditDashboard.data.masterValueParity));assert.equal(parityData.mappings.items.length,231);await fs.unlink(parityTemp);checks.masterValueParity=true;
 assert.equal(await page.locator('#coverageReview').inputValue(),'all');
 assert.equal(await page.locator('#coverageMatrix .normalization-tag').count(),allCatalogItems.length);
 const expectedNormalization=expectedMatrix.normalizationReview;
 assert.match(await page.locator('#normalizationSummary').textContent(),new RegExp('Master catalog v2.*'+expectedNormalization.proposedConcepts.length+' record types'));
 for(const d of expectedNormalization.decisions){
  await page.locator(`[data-normalization-decision="${d.id}"]`).click();
  assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),d.count);
  assert.equal(await page.locator(`#coverageMatrix .normalization-tag[data-decision="${d.id}"]`).count(),d.count);
 }
 await page.selectOption('#normalizationFilter','retirement');
 assert.deepEqual(await page.locator('#coverageMatrix [data-matrix-item]').evaluateAll(rows=>rows.map(r=>r.dataset.matrixItem)),[]);
 await page.locator('#showProposedConcepts').click();
 assert.equal(await page.locator('#coverageGrouping').inputValue(),'concepts');
 assert.equal(await page.locator('#coverageMatrix tbody').count(),expectedNormalization.proposedConcepts.length);
 assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),allCatalogItems.length);
 await page.selectOption('#coverageArea','collection.field');assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),6);
 await page.locator('[data-matrix-item="collection.field.confidence"] .normalization-detail > summary').click();
 assert.match(await page.locator('[data-matrix-item="collection.field.confidence"] .normalization-detail').textContent(),/Value: number/);
 await page.locator('[data-matrix-item="collection.field.state"] .normalization-detail > summary').click();
 assert.match(await page.locator('[data-matrix-item="collection.field.state"] .normalization-detail').textContent(),/disabled and readOnly/);
 await page.locator('[data-matrix-item="collection.field.required"] .normalization-detail > summary').click();
 assert.match(await page.locator('[data-matrix-item="collection.field.required"] .normalization-detail').textContent(),/collection.field → required/);
 const normalizationWait=page.waitForEvent('download');await page.locator('#normalizationDownload').click();const normalizationFile=path.join(root,'browser-normalization.json');await (await normalizationWait).saveAs(normalizationFile);
 assert.deepEqual(JSON.parse(await fs.readFile(normalizationFile,'utf8')),expectedMatrix.masterCatalog);await fs.unlink(normalizationFile);
 for(const viewport of [{width:1440,height:1100},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.locator('#coverageMatrixSummary').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);
  await page.screenshot({path:path.join(root,`taxonomy-review-${viewport.width}.png`)});
 }
 await page.selectOption('#coverageGrouping','domains');await page.selectOption('#normalizationFilter','all');
 await page.selectOption('#coverageReview','omitted');checks.taxonomyNormalization=true;
 assert.equal(await page.locator('#coverageReview').inputValue(),'omitted');
 assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),allCatalogItems.filter(i=>['report','standard','full','audit'].some(v=>i[v].representation==='omitted')).length);
 for(const view of expectedMatrix.review.views){
  const card=page.locator(`[data-gap-view="${view.view}"]`);assert.match(await card.textContent(),new RegExp(view.omitted+' omitted / '+view.total));
  await card.click();assert.equal(await page.locator('#coverageView').inputValue(),view.view);
  assert.deepEqual(await page.locator('#coverageMatrix [data-matrix-item]').evaluateAll(rows=>rows.map(r=>r.dataset.matrixItem)),allCatalogItems.filter(i=>i[view.view].representation==='omitted').map(i=>i.canonicalId));
 }
 await page.selectOption('#coverageView','audit');await page.selectOption('#coverageReview','P1');
 assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),0);
 assert.equal(await page.locator('[data-matrix-item="consent.accept.terminal_verification"]').count(),0);
 const p2=await page.evaluate(()=>window.__auditDashboard.data.masterValueParity.p2Coverage);assert.equal(p2.items.length,12);assert.ok(p2.items.every(i=>i.aggregateRate===null&&i.availableScans+i.unavailableScans===i.eligibleScans));
 await page.selectOption('#coverageReview','blocked_missing_evidence');assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),p2.items.filter(i=>i.availableScans===0&&!['collection.field.input_type', 'collection.field.required', 'collection.field.state'].includes(i.legacyId)).length);
 assert.match(await page.locator('#p2ResolutionSummary').textContent(),/P2 decisions across 21 item\/view gaps/);
 await page.selectOption('#coverageReview','implemented_locally');assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),p2.items.filter(i=>i.availableScans>0&&!['collection.field.input_type', 'collection.field.required', 'collection.field.state'].includes(i.legacyId)).length+4);
 for(const side of ['baseline','gpc'])for(const axis of ['sale','sharing'])assert.equal(await page.locator('[data-matrix-item="gpc.cmp_pair.'+side+'.'+axis+'"] [data-coverage-column="audit"] .gap-review[data-resolution] > summary').textContent(),'Connected · bound CMP snapshots');
 const delivery=page.locator('[data-matrix-item="gpc.delivery.http_header"] .p2-coverage');await delivery.locator('summary').click();assert.match(await delivery.textContent(),/Separate UTC date \/ schema \/ policy/);await delivery.locator('summary').click();
 assert.equal(p2.version,'certscore.audit-p2-retained-coverage.v2');assert.equal(p2.persistedSources.status,'verified');
 assert.ok(p2.items.every(i=>i.records+i.unknownRecords===i.retainedRecords&&i.scansWithRecords+i.emptyInventoryScans<=i.eligibleScans&&i.groups.reduce((n,g)=>n+g.retainedRecords,0)===i.retainedRecords));
 const connected=p2.items.filter(i=>i.groups.some(g=>g.sourceView==='persisted_assessment'&&g.retainedRecords>0));
 if(p2.compactReceipts?.matched){
  const compactFields=p2.items.filter(i=>i.groups.some(g=>g.schema==='certscore.audit-privacy-form-receipt.v1'));
  await page.selectOption('#coverageReview','all');
  for(const item of compactFields){
   const cell=page.locator('[data-matrix-item="'+item.legacyId+'"] .p2-coverage');
   assert.equal(await cell.locator('.p2-compact-receipt').count(),1);
  }
  await page.selectOption('#coverageReview','implemented_locally');
 }
 for(const i of connected.filter(i=>!['collection.field.input_type', 'collection.field.required', 'collection.field.state'].includes(i.legacyId))){const badge=page.locator('[data-matrix-item="'+i.legacyId+'"] [data-coverage-column="audit"] [data-resolution="implemented_locally"] > summary');assert.equal(await badge.textContent(),'Connected · local evidence');}
 if(connected.some(i=>i.legacyId==='privacy.california.coverage')){
  const ca=page.locator('[data-matrix-item="privacy.california.coverage"] .p2-coverage');await ca.locator(':scope > summary').click();assert.match(await ca.textContent(),/audit-only inputs/);assert.ok(await ca.locator('.p2-assessment-values').count()>0);await ca.locator('.p2-assessment-values').first().locator(':scope > summary').click();assert.match(await ca.textContent(),/family/);
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await ca.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.screenshot({path:path.join(root,`p2-connected-${width}.png`)});}
  await ca.locator(':scope > summary').click();await page.setViewportSize({width:1440,height:1000});
 }
 checks.p2Coverage=true;checks.p2PersistedSources=true;
 await page.selectOption('#coverageReview','related_only');assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),3);
 await page.selectOption('#coverageView','all');await page.selectOption('#coverageReview','flagged');
 assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),4);
 for(const flag of ['potential_overlap','low_standalone_value']){
  const count=allCatalogItems.filter(i=>i.valueReview.flag===flag).length;
  assert.equal(await page.locator(`[data-value-review="${flag}"]`).count(),count);
  if(count)assert.equal(await page.locator(`[data-value-review="${flag}"] > th`).first().evaluate(e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)'),false);
 }
 await page.locator('#coveragePriorities > summary').click();assert.match(await page.locator('#coveragePriorityList').textContent(),/Existing item · evidence availability/);
 for(const viewport of [{width:1440,height:1100},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.locator('#coverageComparison').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);
  await page.screenshot({path:path.join(root,`coverage-gap-review-${viewport.width}.png`)});
 }
 await page.locator('#coveragePriorities > summary').click();
 await page.selectOption('#coverageReview','all');checks.evidenceGapReview=true;
 const totalItems=expectedMatrix.catalog.items.length;
 assert.equal(await page.locator('#coverageGrouping').inputValue(),'domains');
 assert.equal(await page.locator('#coverageMatrix thead th').count(),5);
 assert.match(await page.locator('#coverageMatrix thead th').nth(1).textContent(),/Web · PDF · DOCX/);
 assert.equal(await page.locator('#coverageMatrix .report-formats').count(),totalItems);
 assert.equal(await page.locator('#coverageMatrix .report-formats[open]').count(),0);
 const formats=page.locator('#coverageMatrix .report-formats').first();await formats.locator('summary').click();
 assert.equal(await formats.locator('[data-report-format]').count(),3);await formats.locator('summary').click();checks.reportFormats=true;
 const formatCounts=Object.fromEntries(['rendered_value_checked','rendered_summary_checked','source_reviewed_boundary','outside_report_scope'].map(status=>[status,expectedMatrix.domains.flatMap(d=>d.items).filter(i=>i.reportFormats.pdf.status===status).length]));
 assert.match(await page.locator('#reportFormatPolicy').textContent(),new RegExp(formatCounts.rendered_value_checked+' values checked; '+formatCounts.rendered_summary_checked+' summaries checked; '+formatCounts.source_reviewed_boundary+' items still without rendered-value parity; '+formatCounts.outside_report_scope+' outside report scope'));
 const screenshotFormats=page.locator('[data-matrix-item="consent.visual.banner_ref"] .report-formats');await screenshotFormats.locator('summary').click();
 assert.match(await screenshotFormats.locator('[data-report-format="docx"]').textContent(),/Rendered value checked[\s\S]*source-bound links/);await screenshotFormats.locator('summary').click();
 assert.equal(await page.locator('#coverageMatrix tbody').count(),expectedMatrix.domains.length);
 assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),totalItems);
 const actualCells=await page.locator('#coverageMatrix [data-matrix-item]').evaluateAll(rows=>rows.map(row=>({id:row.dataset.matrixItem,cells:[...row.querySelectorAll('td')].map(c=>({status:c.querySelector('.coverage-badge').textContent,detail:c.querySelector('[data-coverage-detail]').textContent}))})));
 assert.deepEqual(actualCells,expectedMatrix.domains.flatMap(a=>a.items.map(i=>({id:i.canonicalId,cells:['report','standard','full','audit'].map(k=>({status:i[k].status,detail:i[k].detail}))}))));
 await page.selectOption('#coverageArea','consent');await page.selectOption('#coverageKind','assessment');await page.fill('#coverageSearch','terminal_verification');
 assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),2);
 assert.equal(await page.locator('[data-matrix-item="consent.accept.terminal_verification"]').count(),1);
 assert.equal(await page.locator('[data-matrix-item="consent.reject.terminal_verification"]').count(),1);
 await page.fill('#coverageSearch','unlikely-match-no-results');assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),0);assert.match(await page.locator('#coverageMatrixSummary').textContent(),/No matching items/);
 await page.fill('#coverageSearch','');await page.selectOption('#coverageKind','all');await page.selectOption('#coverageGrouping','areas');
 assert.equal(await page.locator('#coverageMatrix tbody').count(),19);
 await page.selectOption('#coverageArea','audit_only');assert.equal(await page.locator('#coverageMatrix tbody').count(),6);
 await page.selectOption('#coverageArea','forms');
 const formFields=page.locator('[data-matrix-item="collection.field.required"]');
 assert.equal(await formFields.locator('[data-coverage-column="standard"] .coverage-badge').textContent(),'Omitted');
 assert.equal(await formFields.locator('[data-coverage-column="full"] .coverage-badge').textContent(),'Detailed');
 await formFields.locator('.catalog-definition > summary').click();assert.match(await formFields.textContent(),/See each view’s retained-value check/);
 const catalogWait=page.waitForEvent('download');await page.locator('#catalogDownload').click();const catalogDownload=await catalogWait,catalogFile=path.join(root,'browser-evidence-catalog.json');await catalogDownload.saveAs(catalogFile);
 assert.deepEqual(JSON.parse(await fs.readFile(catalogFile,'utf8')),expectedMatrix);await fs.unlink(catalogFile);
 for(const viewport of [{width:1440,height:1100},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.locator('#coverageComparison').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);
  await page.screenshot({path:path.join(root,`coverage-matrix-${viewport.width}.png`)});
  const scroll=page.locator('.coverage-matrix-scroll');await scroll.evaluate(e=>e.scrollLeft=e.scrollWidth);
  const first=await formFields.locator('th').boundingBox(),bounds=await scroll.boundingBox();assert.ok(first&&bounds&&first.x>=bounds.x&&first.x<bounds.x+3);
  await scroll.evaluate(e=>e.scrollLeft=0);
 }
 await page.selectOption('#coverageGrouping','domains');assert.equal(await page.locator('#coverageMatrix [data-matrix-item]').count(),totalItems);
 await page.locator('#coverageComparison > summary').click();
 assert.equal(await page.locator('#coverageComparison').evaluate(e=>e.open),false);
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);checks.coverageMatrix=true;checks.evidenceCatalog=true;
 await fs.writeFile(path.join(root,'browser-validation.json'),JSON.stringify({status:'passed',checks,measureCatalogSha256:createHash('sha256').update(JSON.stringify(measureCatalog)).digest('hex'),externalRequests,errors,htmlSha256:createHash('sha256').update(await fs.readFile(file)).digest('hex'),validatedAtUtc:new Date().toISOString()},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'passed',checks,externalRequests}));
}finally{await browser.close();}
