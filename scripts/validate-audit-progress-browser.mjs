/** File-only audit viewer verification. External requests are rejected and counted. */
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]),file=path.join(root,'dashboard.html');const browser=await chromium.launch({headless:true});let externalRequests=0;const errors=[],checks={};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await context.route('**/*',route=>{if(!route.request().url().startsWith('file:')){externalRequests++;return route.abort();}return route.continue();});const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:60000});await page.waitForFunction(()=>window.__auditDashboard?.days?.length>0,{timeout:60000});
 assert.equal(await page.locator('#daily tbody tr[data-table-id]').count(),await page.evaluate(()=>window.__auditDashboard.data.tableEntries.length));
 const measureCatalog=await page.evaluate(()=>window.__auditDashboard.data.measureCatalog);
 assert.ok(measureCatalog?.entries?.length>0);assert.equal(measureCatalog.entries.length,await page.locator('#daily tbody tr[data-table-id]').count());
 assert.equal(await page.locator('#tableSummary').textContent(),measureCatalog.entries.length+' metrics');
 for(const removal of measureCatalog.removals)assert.equal(await page.locator('[data-table-id="'+removal.id+'"],#metric option[value="metric:'+removal.id+'"]').count(),0);
 for(const entry of measureCatalog.entries)assert.ok(entry.canonicalLinks.length&&entry.canonicalLinks.every(link=>link.recordType&&link.recordLabel&&link.basis));
 assert.equal(await page.locator('#daily .canonical-mapping').count(),measureCatalog.entries.length);checks.measureCatalog=true;
 assert.match(await page.locator('#trendTitle').textContent(),/Reject control presence/);assert.ok((await page.locator('#trend circle title').allTextContents()).every(s=>s.includes('public_export/')&&s.includes('/')));checks.chartTooltips=true;
 const bounds=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1);checks.desktop=true;
 const quantityExample=await page.evaluate(()=>{const days=window.__auditDashboard.days,i=days.findIndex(d=>d.quantities['technology.detections'].total>0&&Object.values(d.quantities['technology.detections'].series).some(p=>p.median===0&&p.total>0));return i<0?null:{index:i,total:days[i].quantities['technology.detections'].total};});
 if(quantityExample){const cell=page.locator('[data-table-kind="quantity"][data-table-id="technology.detections"] td').nth(quantityExample.index+1);assert.match(await cell.locator(':scope>.value').textContent(),new RegExp(quantityExample.total.toLocaleString()));assert.match(await cell.textContent(),/Median 0.0/);}
 const mixedMeasured=await page.evaluate(()=>window.__auditDashboard.days.flatMap((d,i)=>Object.entries(d.quantities).filter(([id,v])=>id.startsWith('gpc.')&&v.source==='mixed_sources'&&v.measured>0&&v.total===null).map(([id])=>({id,index:i}))));
 for(const entry of mixedMeasured.slice(-8)){
  const value=await page.locator(`[data-table-id="${entry.id}"] td`).nth(entry.index+1).locator(':scope>.value').textContent();
  assert.equal(value,'Separate measurement groups');
 }
 checks.quantityTotals=true;
 const rateExamples=await page.evaluate(()=>{
  const dashboard=window.__auditDashboard;
  return ['metrics','findings'].map(kind=>dashboard.days.flatMap((day,index)=>
   Object.entries(day[kind]).filter(([,v])=>v.source==='mixed_sources'&&Object.values(v.series).some(p=>Number.isFinite(p.rate))&&
    (kind==='findings'||Object.keys(v.counts).some(state=>state!=='unknown'&&state!=='unavailable')))
    .map(([id])=>({id,index,kind:kind==='findings'?'finding':'metric'}))).at(-1)).filter(Boolean);
 });
 for(const {id,index,kind} of rateExamples){
  const headline=page.locator(`[data-table-kind="${kind}"][data-table-id="${id}"] td`).nth(index+1).locator(':scope>.value').first();
  assert.match(await headline.textContent(),/^[0-9]+\.[0-9]% · /);
 }
 const lastDay=await page.evaluate(()=>window.__auditDashboard.days.length);
 const unretained=page.locator('[data-table-id="terminal.accept"] td').nth(lastDay);
 if(await unretained.locator(':scope>.value').textContent()==='Unavailable')assert.match(await unretained.textContent(),/No source-bound terminal verification/);
 checks.availability=true;
 await page.screenshot({path:path.join(root,'desktop.png'),fullPage:true});
 for(const [button,name]of [['csv','daily-metrics.csv'],['quantityCsv','daily-volumes.csv'],['findingCsv','daily-findings.csv']]){const wait=page.waitForEvent('download');await page.locator('#'+button).click();const dl=await wait;const temp=path.join(root,'browser-'+name);await dl.saveAs(temp);assert.equal(await fs.readFile(temp,'utf8'),await fs.readFile(path.join(root,name),'utf8'));await fs.unlink(temp);}checks.csvParity=true;
 const regions=await page.locator('#region option').evaluateAll(opts=>opts.map(o=>o.value));if(regions.length>1){await page.selectOption('#region',regions[1]);assert.equal(await page.evaluate(()=>window.__auditDashboard.currentRows().every(r=>r.region===document.getElementById('region').value)),true);const content=await page.evaluate(()=>window.__auditDashboard.engine.stateCsv(window.__auditDashboard.days,window.__auditDashboard.data.metrics));const wait=page.waitForEvent('download');await page.locator('#csv').click();const dl=await wait,temp=path.join(root,'filtered.csv');await dl.saveAs(temp);assert.equal(await fs.readFile(temp,'utf8'),content);await fs.unlink(temp);await page.selectOption('#region','all');}
 const providers=await page.locator('#cmp option').evaluateAll(opts=>opts.map(o=>o.value));if(providers.length>1){await page.selectOption('#cmp',providers[1]);assert.equal(await page.evaluate(()=>window.__auditDashboard.currentRows().every(r=>r.states.cmp_provider===document.getElementById('cmp').value)),true);await page.selectOption('#cmp','all');}
 await page.selectOption('#origin','selection');assert.equal(await page.evaluate(()=>window.__auditDashboard.currentRows().every(r=>r.originProof==='production_id_selection_only'&&r.reportable===false)),true);await page.selectOption('#origin','all');
 await page.selectOption('#group','Controls');assert.equal(await page.locator('#daily tbody tr[data-table-id]').count(),5);checks.filters=true;
 const publicOptOut=page.locator('[data-table-id="control.privacyOptOut"]');
 const unexported=await page.evaluate(()=>window.__auditDashboard.days.filter(d=>d.metrics['control.privacyOptOut'].denominator>0&&Object.keys(d.metrics['control.privacyOptOut'].series).every(s=>/^public_export\/pulse-public-v(?:4|5|10)\//.test(s))).length);
 assert.equal(await publicOptOut.locator('td>.value').filter({hasText:'Not exported'}).count(),unexported);
 for(const cell of (await publicOptOut.locator('td').all()).slice(1))if((await cell.locator(':scope>.value').textContent())==='Not exported')assert.ok(!(await cell.textContent()).match(/\b0\/\d+/));
 const retainedOptOut=page.locator('[data-table-id="sealed.control.privacyOptOut"]');
 assert.match(await retainedOptOut.textContent(),/Opt-out control presence · retained assessment/);
 const positive=await page.evaluate(()=>window.__auditDashboard.days.reduce((n,d)=>n+(d.metrics['sealed.control.privacyOptOut'].counts.observed??0),0));
 if(positive>0)assert.match(await retainedOptOut.textContent(),/observed:/);
 checks.optOutCoverage=true;
 await page.selectOption('#group','Opt-out');
 const dispatch=page.locator('[data-table-id="sealed.opt_out.dispatch"]');
 assert.match(await dispatch.textContent(),/Effective opt-out dispatch status/);
 for(const state of ['excluded_by_profile','dispatch_recorded','profile_dispatch_conflict']){
  const days=await page.evaluate(state=>window.__auditDashboard.days.filter(d=>d.metrics['sealed.opt_out.dispatch'].counts[state]>0).length,state);
  assert.equal(await dispatch.locator('td').filter({hasText:state.replaceAll('_',' ')+':'}).count(),days);
 }
 checks.optOutDispatch=true;
 await page.selectOption('#group','Controls');
 const icon=page.locator('[data-chart-id="control.reject"]');await icon.click();await page.waitForSelector('#chartPopover:not([hidden])');assert.match(await page.locator('#chartPopoverTitle').textContent(),/presence/);assert.ok(await page.locator('#contract').textContent());await page.screenshot({path:path.join(root,'desktop-chart.png'),fullPage:true});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await icon.click();const rect=await page.locator('#chartPopover').boundingBox();assert.ok(rect&&rect.x>=0&&rect.x+rect.width<=391&&rect.y>=0&&rect.y+rect.height<=845);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true);await page.screenshot({path:path.join(root,'mobile-chart.png'),fullPage:true});checks.mobile=true;
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
 assert.equal(await page.locator('main > .panel').first().getAttribute('id'),'coverageComparison');
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
