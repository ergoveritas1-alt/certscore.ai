import {P2_AUDIT_IDS} from './audit-p2-coverage';
import assert from 'node:assert/strict';
import test from 'node:test';
import {EVIDENCE_CATALOG,CATALOG_VIEW_BINDINGS,REPRESENTATIONS,AVAILABILITY_STATES} from './audit-evidence-catalog';
import {COVERAGE_SOURCE_NOTES} from './audit-evidence-output-notes';
import {COVERAGE_MATRIX} from './audit-progress-coverage-matrix';

test('canonical identities are unique, typed and independent of report placement',()=>{
 const catalog=EVIDENCE_CATALOG,ids=new Set(catalog.items.map(i=>i.id));
 assert.equal(ids.size,catalog.items.length);assert.equal(catalog.domains.length,12);
 for(const i of catalog.items){
  assert.match(i.id,/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);assert.ok(i.id.startsWith(i.domain+'.'));
  assert.ok(catalog.domains.some(d=>d.id===i.domain));assert.ok(catalog.kinds.includes(i.kind));
  assert.ok(i.subject&&i.definition&&i.valueType&&i.scope);assert.ok(i.sourceBinding.includes('original_source_hash'));
 }
 assert.equal(CATALOG_VIEW_BINDINGS.length,ids.size);
 assert.equal(new Set(CATALOG_VIEW_BINDINGS.map(b=>b.itemId)).size,ids.size);
 assert.deepEqual([...new Set(CATALOG_VIEW_BINDINGS.map(b=>b.sourceNoteKey))].sort(),COVERAGE_SOURCE_NOTES.map(n=>n.key).sort());
 assert.equal(COVERAGE_SOURCE_NOTES.length,99);
 assert.deepEqual(COVERAGE_MATRIX.domains.flatMap(a=>a.items.map(i=>i.id)).sort(),[...ids].sort());
 assert.deepEqual(COVERAGE_MATRIX.areas.flatMap(a=>a.items.map(i=>i.id)).sort(),[...ids].sort());
});
test('choice stages and GPC windows cannot be conflated by the new taxonomy',()=>{
 const item=(id:string)=>EVIDENCE_CATALOG.items.find(i=>i.id===id)!;
 const bind=(id:string)=>CATALOG_VIEW_BINDINGS.find(i=>i.itemId===id)!;
 for(const action of ['accept','reject']){
  assert.equal(item('consent.'+action+'.click_completed').kind,'action');
  assert.equal(item('consent.'+action+'.initial_registration').kind,'assessment');
  assert.equal(item('consent.'+action+'.terminal_verification').kind,'assessment');
  assert.equal(item('consent.'+action+'.terminal_witness').kind,'provenance');
  assert.deepEqual(bind('consent.'+action+'.initial_registration').metricIds,['registration.'+action]);
  assert.deepEqual(bind('consent.'+action+'.terminal_verification').metricIds,['terminal.'+action,'sealed.terminal.'+action,'sealed.terminal.audit_'+action]);
 }
 assert.equal(item('gpc.pair.gpc.advertising_requests').scope,'paired_window');
 assert.equal(item('gpc.visit.advertising_collection').scope,'full_gpc_visit');
 assert.equal(item('gpc.cmp_pair.baseline.sale').kind,'observation');
 assert.equal(item('gpc.cmp_pair.gpc.sale').kind,'observation');
 assert.equal(item('gpc.cmp_pair.sale_transition').kind,'assessment');
 assert.equal(item('privacy.choice.result_record').kind,'assessment','Neutral canonical result records must not be classified as findings');
 assert.notDeepEqual(bind('gpc.pair.gpc.advertising_requests').metricIds,bind('gpc.visit.advertising_collection').metricIds);
});
test('representation and per-scan availability are separate and no missing item gains audit coverage',()=>{
 const entries=COVERAGE_MATRIX.domains.flatMap(a=>a.items);
 for(const i of entries){
  assert.equal(i.availability,'not_evaluated_in_catalog_view');
  for(const view of ['report','standard','full','audit'] as const)assert.ok(REPRESENTATIONS.includes(i[view].representation));
  const binding=CATALOG_VIEW_BINDINGS.find(b=>b.itemId===i.id)!;
  if(binding.auditBasis==='none'&&!P2_AUDIT_IDS.includes(i.id))assert.equal(i.audit.representation,'omitted');
  if(binding.metricRelationship==='related'&&!P2_AUDIT_IDS.includes(i.id))assert.equal(i.audit.representation,'summarized');
 }
 const required=entries.find(i=>i.id==='collection.field.required')!;
 assert.equal(required.standard.representation,'omitted');assert.equal(required.full.representation,'detailed');assert.equal(required.audit.representation,'derived');
 const terminal=entries.find(i=>i.id==='consent.accept.terminal_witness')!;
 for(const view of ['report','standard','full','audit'] as const)assert.equal(terminal[view].representation,'omitted');
 assert.ok('unknown' in AVAILABILITY_STATES&&'invalid_or_unbound' in AVAILABILITY_STATES&&'unsupported_version' in AVAILABILITY_STATES);
 assert.ok(!('not_observed' in AVAILABILITY_STATES)&&!('zero' in AVAILABILITY_STATES));
});

test('gap inventory reconciles every view without treating all summaries as missing',()=>{
 const rows=COVERAGE_MATRIX.domains.flatMap(a=>a.items);
 for(const view of COVERAGE_MATRIX.review.views){
  assert.equal(view.total,231);assert.equal(view.omitted+view.represented,view.total);
  assert.equal(view.close+view.intentional+view.deferred,view.omitted+view.relatedOnly);
  assert.deepEqual(view.gaps.map(r=>r.itemId).sort(),rows.filter(r=>r[view.view].representation==='omitted'||view.view==='audit'&&r.metricRelationship==='related').map(r=>r.canonicalId).sort());
  for(const gap of view.gaps){assert.ok(gap.reason&&gap.nextStep);assert.equal(gap.disposition==='retain_omission',gap.priority===null);}
 }
 const row=(id:string)=>rows.find(i=>i.canonicalId===id)!;
 assert.equal(row('consent.accept.terminal_verification').viewReview.audit!.gap,'none');
 assert.equal(row('consent.accept.terminal_witness').viewReview.audit!.disposition,'retain_omission');
 assert.equal(row('gpc.cmp_pair.baseline.sale').viewReview.audit!.resolution,'implemented_locally');
 assert.equal(row('consent.cmp.criterion.banner').viewReview.audit!.gap,'related_only');
 assert.equal(row('privacy.optout.dispatch').viewReview.report!.disposition,'retain_omission');
 assert.equal(row('collection.field.required').viewReview.standard!.resolution,'intentional_subset');
 assert.equal(row('consent.accept.initial_registration').valueReview.flag,'retain');
});
test('value review and roadmap reference real distinct items and never delete evidence',()=>{
 const rows=COVERAGE_MATRIX.domains.flatMap(a=>a.items),ids=new Set(rows.map(i=>i.canonicalId));
 assert.equal(rows.filter(i=>i.valueReview.flag!=='retain').length,4);
 for(const row of rows)for(const related of row.valueReview.relatedIds){assert.ok(ids.has(related));assert.notEqual(related,row.canonicalId);}
 for(const step of COVERAGE_MATRIX.review.priorityOrder)for(const id of step.itemIds)assert.ok(ids.has(id));
 assert.equal(COVERAGE_MATRIX.review.noProvenValueFreeItems,true);
 assert.equal(COVERAGE_MATRIX.review.priorityOrder[0]!.kind,'Existing item · evidence availability');
 for(const id of ['consent.accept.click_completed','consent.accept.initial_registration','consent.accept.terminal_verification','gpc.pair.gpc.advertising_requests','gpc.visit.advertising_collection'])assert.equal(rows.find(i=>i.canonicalId===id)!.valueReview.flag,'retain');
});

test('normalization reviews every current ID exactly once without losing fields or proof',()=>{
 const rows=COVERAGE_MATRIX.domains.flatMap(a=>a.items),review=COVERAGE_MATRIX.normalizationReview;
 assert.equal(review.status,'logical_catalog_reviewed');assert.equal(review.reviewedItems,231);
 assert.equal(review.proposedConcepts.length,51);assert.equal(review.wholeEvidenceDeletionsRecommended,0);
 assert.equal(review.decisions.reduce((n,d)=>n+d.count,0),231);
 assert.deepEqual(COVERAGE_MATRIX.concepts.flatMap(c=>c.items.map(i=>i.canonicalId)).sort(),rows.map(i=>i.canonicalId).sort());
 const slots=new Set<string>();
 for(const row of rows){const n=row.normalization;
  const slot=n.proposedConceptId+'|'+n.field+'|'+JSON.stringify(Object.entries(n.dimensions).sort());
  assert.ok(!slots.has(slot),slot);slots.add(slot);
  assert.equal(n.originalKind,row.kind);assert.equal(n.originalScope,row.scope);assert.equal(n.originalCardinality,row.cardinality);
  assert.deepEqual(n.sourceBinding,row.sourceBinding);assert.ok(n.reason&&n.itemReason&&n.migration);
 }
 assert.deepEqual(rows.filter(r=>r.normalization.decision==='alias_candidate').map(r=>r.canonicalId).sort(),[]);
 assert.deepEqual(rows.filter(r=>r.normalization.decision==='retire_standalone').map(r=>r.canonicalId),[]);
});
test('proposed record grouping preserves choice stages, distinct verdicts, arms and windows',()=>{
 const rows=COVERAGE_MATRIX.domains.flatMap(a=>a.items),n=(id:string)=>rows.find(i=>i.canonicalId===id)!.normalization;
 const stages=['click_completed','initial_registration','terminal_verification'].map(s=>n('consent.accept.'+s).proposedConceptId);
 assert.equal(new Set(stages).size,3);
 assert.notDeepEqual(n('consent.accept.click_completed').dimensions,n('consent.reject.click_completed').dimensions);
 assert.equal(n('tracking.tracking.evidence_state').proposedConceptId,n('tracking.tracking.verdict').proposedConceptId);
 assert.notEqual(n('tracking.tracking.evidence_state').field,n('tracking.tracking.verdict').field);
 const cmp=['baseline.sale','baseline.sharing','gpc.sale','gpc.sharing'].map(s=>n('gpc.cmp_pair.'+s));
 assert.equal(new Set(cmp.map(m=>m.proposedConceptId)).size,1);assert.equal(new Set(cmp.map(m=>JSON.stringify(m.dimensions))).size,4);
 assert.notEqual(n('gpc.pair.gpc.advertising_requests').proposedConceptId,n('gpc.visit.advertising_collection').proposedConceptId);
 assert.notEqual(n('policies.text.local_verification').field,n('policies.text.producer_receipt').field);
 assert.equal(new Set(['label','input_type','semantic_category','required','state','confidence'].map(s=>n('collection.field.'+s).proposedConceptId)).size,1);
 assert.notDeepEqual(n('page.platform').dimensions,n('technology.detection.product').dimensions,'Alias candidates must not merge observations before equivalence is proven');
});
