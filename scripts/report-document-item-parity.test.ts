import assert from 'node:assert/strict';import test from 'node:test';
import {renderCanonicalReportPdf} from '../apps/web/server/scans/report-export-pdf';
import {renderCanonicalReportDocx} from '../apps/web/server/scans/report-export-docx';
import {documentChoiceDetails,documentGpcDetails} from '../apps/web/server/scans/report-document-choice-details';
import {documentFixture} from './lib/report-format-fixtures';
import {pdfText,docxText,docxParts,normalizeDocumentText} from './lib/report-format-test-io';
import {pdfPublicWords} from '../apps/web/server/scans/report-pdf-reader';
import {reportStatusLabel} from '../apps/web/lib/scans/report-status-presentation';
import {buildTimelineReportModel} from '../apps/web/components/scans/report-lab/timeline-report-model';
async function outputs(report:ReturnType<typeof documentFixture>['report']){return {pdf:pdfText(renderCanonicalReportPdf(report)),docx:docxText(await renderCanonicalReportDocx(report))};}
const present=(content:string,value:string)=>assert.ok(content.includes(normalizeDocumentText(pdfPublicWords(reportStatusLabel(value)))),`Missing rendered value: ${value}`);

test('actual PDF/DOCX retain all thirteen CMP assessments with distinct statuses and source report parity',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('No external fetch');});
 for(const focus of ['gdpr_eprivacy','ccpa_cpra'] as const){const {scan,report}=documentFixture(focus);const web=buildTimelineReportModel(scan);assert.ok('findings' in web);
  assert.deepEqual(report.appendix.evidenceDossier.cmp.audit.rows.map(r=>[r.id,r.status]),web.cmpAudit!.rows.map(r=>[r.id,r.status]));
  assert.equal(report.appendix.evidenceDossier.cmp.audit.rows.length,13);
  const before=JSON.stringify(report),out=await outputs(report);
  for(const content of Object.values(out)){present(content,'Provider: OneTrust');for(const row of report.appendix.evidenceDossier.cmp.audit.rows){present(content,row.label+' '+reportStatusLabel(row.status));if(row.detail)present(content,row.detail);}}
  assert.equal(JSON.stringify(report),before);
 }
});

test('actual files keep terminal verification separate from initial registration and execution in both actions',async()=>{
 const {report}=documentFixture('gdpr_eprivacy',true),rows=documentChoiceDetails(report);
 assert.deepEqual(rows.map(r=>r.slice(2)),[['unconfirmed','Not verified','Verified'],['unconfirmed','Not verified','Verified']]);
 for(const content of Object.values(await outputs(report)))for(const row of rows)present(content,row.join(' '));
 const missing=structuredClone(report);delete missing.postAcceptObservation!.confirmation;
 for(const content of Object.values(await outputs(missing)))present(content,'Accept succeeded with confirmation Unknown Unknown Unknown');
 const invalid=structuredClone(report);invalid.postAcceptObservation!.confirmation!.initialRegistrationStatus='confirmed';invalid.postAcceptObservation!.confirmation!.terminalDecisionVerified=null;
 for(const content of Object.values(await outputs(invalid)))present(content,'Accept succeeded with confirmation confirmed Not verified Unknown');
});

test('actual files retain independent paired GPC counts, CMP snapshots and full-visit measurements',async()=>{
 const {report}=documentFixture('ccpa_cpra'),rows=documentGpcDetails(report);assert.ok(rows.length>12);
 for(const content of Object.values(await outputs(report))){for(const row of rows)present(content,row.join(' '));present(content,'sale Off, sharing Off; With GPC: sale On, sharing On');present(content,'Semantic observations: +899 ms and +899 ms');}
 const bad=structuredClone(report);bad.gpcResponse!.comparison.gpcArtifact!.sha256='0'.repeat(64);assert.deepEqual(documentGpcDetails(bad),[['Bound GPC detail','Unavailable']]);
 for(const content of Object.values(await outputs(bad))){present(content,'No verified GPC assessment available');assert.doesNotMatch(content,/Site-recorded GPC receipt: Received|Full-visit classified requests/);}
 const missing=structuredClone(report);delete missing.gpcResponse!.activityComparison;delete missing.gpcResponse!.cmpStateComparison;
 for(const content of Object.values(await outputs(missing))){present(content,'Matched request-count window Unavailable');present(content,'Paired CMP snapshots Unavailable');present(content,'Full-visit classified requests 0');}
 const {report:limited}=documentFixture('ccpa_cpra',false,true);assert.ok(documentGpcDetails(limited).some(r=>r[0]==='CMP readiness checkpoint'));
 for(const content of Object.values(await outputs(limited)))for(const row of documentGpcDetails(limited))present(content,row.join(' '));
 const late=documentFixture('ccpa_cpra',false,false,true).report;const lr=documentGpcDetails(late);assert.equal(lr.find(r=>r[0]==='Paired advertising requests')?.[1],'0 -> 0');assert.equal(lr.find(r=>r[0]==='Full-visit advertising collection')?.[1],'1');
 for(const content of Object.values(await outputs(late))){present(content,'Paired advertising requests 0 -> 0');present(content,'Full-visit advertising collection 1');}
 const eu=documentFixture('gdpr_eprivacy').report;for(const content of Object.values(await outputs(eu)))assert.doesNotMatch(content,/Full-visit classified requests|CMP sale snapshots/);
});

test('actual files preserve typed form fields, independent flags, snapshot status and bounded phase counts',async()=>{
 const {report}=documentFixture('gdpr_eprivacy'),first=report.appendix.dataCollectionSurfaces.reportInventory!.rows[0]!.form.fields[0]!;
 first.label='Distinct field';first.inputType='email';first.semanticCategory='email';first.required=true;first.disabled=true;first.readOnly=true;first.confidence=0.75;
 for(const content of Object.values(await outputs(report))){for(const value of ['Inventory summary: 2 recorded forms; 9 recorded fields','Initial page: 0; after Accept: 2','After-Accept capture was limited','Distinct field; element Input; input type Email; category Email; required Yes','disabled Yes; read-only Yes','confidence Moderate confidence','Method: Post','Action: Third Party (forms.example.test)','Form snapshot: available','Form snapshot reference: https://certscore.ai/api/scans/'+report.scan.id+'/form-snapshot?'])present(content,value);}
});

test('actual files retain accessibility counts and example nodes plus technology identity/version',async()=>{
 const {report}=documentFixture('gdpr_eprivacy');
 for(const content of Object.values(await outputs(report)))for(const value of ['Automated audit: completed; engine axe-core 4.11.3; failed rules 4; affected nodes 4; rules needing review 0','Assessed page: https://example.com/','Selector hints','Fix image-alt','<input id>','Drupal','7.98'])present(content,value);
});

test('page information matches the Web source and ignores a changed document without inferring metadata',async()=>{
 const {scan,report}=documentFixture('gdpr_eprivacy'),web=buildTimelineReportModel(scan);assert.ok('findings' in web);assert.equal(report.pageInformation!.title,web.siteMetadata!.observation.title);
 for(const content of Object.values(await outputs(report)))for(const value of ['Page title: Owned fixture title','Page language: en','Declared platform: WordPress (declared)','Declared version: 6.8.2'])present(content,value);
 (scan.runtimeArtifacts!.siteMetadata as {documentUrl:string}).documentUrl='https://changed.example/';
 const {buildCanonicalReportExport}=await import('../apps/web/server/scans/report-export');const changed=buildCanonicalReportExport(scan)!;assert.equal(changed.pageInformation,undefined);
 for(const content of Object.values(await outputs(changed)))assert.doesNotMatch(content,/Owned fixture title/);
});

test('screenshot links retain scan, image hash and report generation without reading images',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('No image acquisition');});
 const {scan,report}=documentFixture('gdpr_eprivacy'),web=buildTimelineReportModel(scan);assert.ok('findings' in web);
 assert.equal(report.visualReferences.length,3);
 const pdf=renderCanonicalReportPdf(report),docx=await renderCanonicalReportDocx(report),rels=docxParts(docx).get('word/_rels/document.xml.rels')!;
 for(const ref of report.visualReferences){
  const base:{href:string;crop:{screenshotSha256:string}}=web.scan[ref.kind==='banner'?'consentBannerPreview':ref.kind==='reject'?'consentRejectPreview':'consentProminencePreview']!;
  assert.equal(ref.href.split('?')[0],base.href);assert.equal(ref.sha256,base.crop.screenshotSha256);
  assert.ok(pdf.toString('latin1').includes(ref.href));assert.ok(rels.replaceAll('&amp;','&').includes(ref.href));
 }
 const {buildReportVisualReferences,matchesReportVisualReference}=await import('../apps/web/server/scans/report-visual-references');
 const {getVisualEvidenceArtifacts}=await import('../apps/web/lib/scans/visual-evidence');
 const artifact=getVisualEvidenceArtifacts(scan.runtimeArtifacts)[0]!,params=new URL(report.visualReferences[0]!.href,'https://certscore.ai').searchParams;
 assert.equal(matchesReportVisualReference(params,scan,artifact),true);
 assert.equal(matchesReportVisualReference(params,scan,{...artifact,sha256:'f'.repeat(64)}),false);
 const bad=structuredClone(scan);(bad.snapshot as Record<string,unknown>).report_projection_source_hash='b'.repeat(64);assert.equal(matchesReportVisualReference(params,bad,artifact),false);
 const duplicates=new URLSearchParams(params);duplicates.append('expectedSha256',artifact.sha256!);assert.equal(matchesReportVisualReference(duplicates,scan,artifact),false);
 assert.equal(matchesReportVisualReference(new URLSearchParams(),scan,artifact),true,'legacy URLs retain behavior');
 assert.deepEqual(buildReportVisualReferences(scan,'https://changed.example/'),[]);
 const hidden=structuredClone(scan);(hidden.runtimeArtifacts!.visualEvidenceArtifacts as {status:string}[])[0]!.status='withheld';assert.deepEqual(buildReportVisualReferences(hidden,'https://example.test/'),[]);
 const unbound=structuredClone(scan);(unbound.runtimeArtifacts!.visualEvidenceArtifacts as {sha256:string}[])[0]!.sha256='e'.repeat(64);assert.deepEqual(buildReportVisualReferences(unbound,'https://example.test/'),[]);
});
