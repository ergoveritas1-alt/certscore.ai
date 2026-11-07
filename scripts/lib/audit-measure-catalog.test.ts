import test from 'node:test';import assert from 'node:assert/strict';
import {auditMeasureLinks,buildAuditMeasureView,RETIRED_TABLE_MEASURES} from './audit-measure-catalog';
import {MASTER_CATALOG} from './audit-evidence-master-catalog';
const metric=(id:string)=>({id,label:id,group:'Test',success:[]});
test('retire only reviewed unsupported slots; preserve terminal and CMP coverage gaps',()=>{
 const ids=[...Object.keys(RETIRED_TABLE_MEASURES),'terminal.accept','terminal.reject','sealed.choice_evidence.paired_cmp','sealed.opt_out.action_completion'];
 const data={metrics:ids.map(metric),rows:[{states:Object.fromEntries(ids.map(id=>[id,'unavailable']))}]};
 const before=JSON.stringify(data),v=buildAuditMeasureView(data);
 assert.equal(v.removals.length,9);assert.equal(v.entries.length,4);assert.equal(JSON.stringify(data),before);
 assert.ok(v.entries.every(e=>e.canonicalLinks.length>0));
});
test('a formerly retired slot returning zero/unknown or positive evidence requires explicit re-review',()=>{
 for(const value of ['unknown','not_observed','fetched'])assert.throws(()=>buildAuditMeasureView({metrics:[metric('policy_fetch')],rows:[{states:{policy_fetch:value}}]}),/now has data/);
});
test('new unmapped measures fail closed instead of falling into a catch-all',()=>{
 assert.throws(()=>auditMeasureLinks('new_unreviewed_metric','metric'),/lacks canonical review/);
});
test('source variants, checklist verdicts and observation fields do not become equal-value aliases',()=>{
 const observation=auditMeasureLinks('control.accept','metric')[0]!,retained=auditMeasureLinks('sealed.control.accept','metric')[0]!,check=auditMeasureLinks('checklist.accept_consent_control','metric')[0]!;
 assert.equal(observation.relationship,'direct_field');assert.equal(retained.relationship,'source_variant');assert.equal(check.relationship,'assessment_context');
 assert.notDeepEqual(observation,retained);assert.deepEqual(check.masterFieldIds,[]);
 assert.notDeepEqual(auditMeasureLinks('checklist.controller_contact_disclosure','metric')[0]!.masterFieldIds,auditMeasureLinks('verdict.controller_contact_disclosure','metric')[0]!.masterFieldIds);
});
test('finding identity and neutral choice records stay distinct',()=>{
 assert.equal(auditMeasureLinks('wcag_example','finding')[0]!.relationship,'inventory_identity');
 assert.equal(auditMeasureLinks('sealed.choice_finding.gpc_response','metric')[0]!.recordType,'privacy.canonical_choice_result');
});
test('all mapped record and field references exist in the v2 master catalog',()=>{
 const ids=['control.accept','sealed.control.accept','terminal.accept','sealed.terminal.audit_accept','detail.gpc.paired_collection','sealed.choice_evidence.paired_cmp','sealed.opt_out.coverage','sealed.checklist.analytics_vendor_observed'];
 for(const id of ids)for(const link of auditMeasureLinks(id,'metric')){assert.ok(MASTER_CATALOG.records.some(r=>r.id===link.recordType));for(const f of link.masterFieldIds)assert.ok(MASTER_CATALOG.fields.some(m=>m.id===f&&m.recordType===link.recordType));}
});
