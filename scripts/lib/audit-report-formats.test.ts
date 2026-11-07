import assert from 'node:assert/strict';
import test from 'node:test';
import {COVERAGE_MATRIX} from './audit-progress-coverage-matrix';
import {reportFormatsFor} from './audit-report-formats';
test('report formats stay under one of four views and never promote unverified items',()=>{
 const items=COVERAGE_MATRIX.domains.flatMap(d=>d.items);
 assert.equal(items.length,231);
 assert.deepEqual(COVERAGE_MATRIX.reportFormats.formats,['web','pdf','docx']);
 for(const i of items){
  assert.deepEqual(Object.keys(i.reportFormats),['web','pdf','docx']);
  assert.deepEqual(Object.keys(i.valueMapping.views),['report','standard','full','audit']);
  for(const c of Object.values(i.reportFormats))assert.ok(['not_performed','local_fixture_bytes'].includes(c.artifactVerification));
 }
 assert.ok(items.filter(i=>i.reportFormats.pdf.status==='rendered_value_checked').length>=45);
 assert.equal(items.filter(i=>i.reportFormats.pdf.status==='shared_content_checked').length,0);
 assert.equal(items.find(i=>i.id==='consent.accept.terminal_verification')!.reportFormats.docx.status,'rendered_summary_checked');
 assert.equal(items.find(i=>i.id==='page.industry')!.reportFormats.pdf.status,'source_reviewed_boundary');
 assert.equal(reportFormatsFor('unreviewed.future.item','detailed').pdf.status,'not_item_verified');
 assert.equal(reportFormatsFor('operations.audit','omitted').docx.status,'outside_report_scope');
 assert.match(reportFormatsFor('consent.visual.banner_ref','referenced').docx.formatDifference!,/reference link/);
});
