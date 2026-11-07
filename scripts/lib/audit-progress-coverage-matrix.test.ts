import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {COVERAGE_MAP} from './audit-progress-coverage';
import {COVERAGE_MATRIX} from './audit-progress-coverage-matrix';
const read=(file:string)=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');
test('matrix retains the report-area mapping and exposes canonical domain views',()=>{
 assert.deepEqual(COVERAGE_MATRIX.areas.map(a=>[a.id,a.kind,a.title]),COVERAGE_MAP.map(a=>[a.id,a.kind,a.box]));
 assert.equal(COVERAGE_MATRIX.migration.originalTopics,99);assert.equal(COVERAGE_MATRIX.migration.unmappedTopics,0);
 assert.equal(COVERAGE_MATRIX.migration.canonicalItems,COVERAGE_MATRIX.catalog.items.length);
 for(const area of COVERAGE_MATRIX.areas){assert.ok(area.items.length);for(const item of area.items)for(const key of ['report','standard','full','audit'] as const)assert.ok(item[key].status&&item[key].detail);}
});
test('file columns are bound to the SDK evidence and full report-display export contracts',()=>{
 assert.match(read('packages/certscore-sdk/src/client.test.ts'),/pulse\.evidence retrieves the bounded Evidence JSON artifact/);
 assert.match(read('apps/web/lib/pulse/projection.ts'),/type: "certscore_pulse_evidence"/);
 const route=read('apps/web/app/api/v2/scans/[scanId]/report-evidence/route.ts');
 assert.match(route,/buildReportDisplayExport\(selected\?\.report \?\? exportedReport/);
 assert.match(route,/if \(download\) return new Response\(serialized/);
 const full=read('apps/web/lib/api-v2/report-display-export.ts');
 const sf=ts.createSourceFile('full.ts',full,ts.ScriptTarget.Latest,true);
 let fields:string[]=[];
 function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='REPORT_FIELDS'){
  assert.ok(n.initializer&&ts.isNewExpression(n.initializer));const arg=n.initializer.arguments?.[0];assert.ok(arg&&ts.isArrayLiteralExpression(arg));
  fields=arg.elements.map(e=>{assert.ok(ts.isStringLiteral(e));return e.text;});
 }ts.forEachChild(n,visit);}visit(sf);
 for(const field of ['cmpAudit','cmsSecurity','collectionSurfaces','collectionTableRows','siteMetadata','gpcResponse','acceptPath','rejectPath','privacyAuditEvidence'])assert.ok(fields.includes(field),field);
 for(const field of ['siteIntegrity','formDestinations','runtimeEvidenceGraph','priorityEvidence','operationsEvidence'])assert.ok(!fields.includes(field),field);
 assert.match(full,/"canonicalEvidenceJson", "evidenceJson", "runtimeEvidenceGraph"/);
 assert.match(full,/scope: "report_display_content"/);
 assert.match(full,/reportContentRef/);
 const area=(id:string)=>COVERAGE_MATRIX.areas.find(a=>a.id===id)!;
 assert.equal(area('forms').items.find(i=>i.id==='collection.field.required')!.standard.status,'Omitted');
 assert.equal(area('forms').items.find(i=>i.id==='collection.field.required')!.full.status,'Detailed');
 assert.equal(area('site_integrity').items.find(i=>i.id==='integrity.links.evidence_count')!.full.status,'Omitted');
 assert.match(area('privacy').items.find(i=>i.id==='privacy.optout.control_presence')!.standard.detail,/v4\/v5\/v10 do not export/);
});
