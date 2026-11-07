import assert from 'node:assert/strict';
import test from 'node:test';
import {MASTER_CATALOG,masterFieldForLegacy} from './audit-evidence-master-catalog';
import {verifyMasterSources} from './audit-evidence-source-review';
import {COVERAGE_MATRIX} from './audit-progress-coverage-matrix';
import {describeSiteTechnology} from '../../packages/certscore-contracts/src/site-metadata';
import {matchTechnologySignal,buildTechnologyInventory} from '../../packages/certscore-contracts/src/technology-inventory';
import {collectionSurfaceFieldSchema} from '../../packages/certscore-contracts/src/collection-surface-form';

test('v2 master preserves every legacy field and maps every output without a value migration',()=>{
 const c=MASTER_CATALOG;assert.equal(c.version,'certscore.evidence-master-catalog.v2');
 assert.equal(c.records.length,51);assert.equal(c.fields.length,231);
 assert.equal(new Set(c.fields.map(f=>f.id)).size,231);assert.equal(new Set(c.compatibility.entries.map(e=>e.legacyId)).size,231);
 assert.deepEqual(c.records.flatMap(r=>r.fieldIds).sort(),c.fields.map(f=>f.id).sort());
 assert.notEqual(masterFieldForLegacy('gpc.cmp_pair.baseline.sale').sourceScope,masterFieldForLegacy('gpc.pair.baseline.advertising_requests').sourceScope);
 assert.equal(masterFieldForLegacy('gpc.cmp_pair.baseline.sale').legacySourceScope,'paired_window');
 assert.equal(c.compatibility.rewrittenHistoricalValues,0);assert.equal(c.outputMigration.standard,'not_migrated');
 assert.throws(()=>masterFieldForLegacy('unknown.field'),/Unmapped/);
 const items=COVERAGE_MATRIX.domains.flatMap(d=>d.items);
 for(const b of COVERAGE_MATRIX.masterCatalog.viewBindings){
  const item=items.find(i=>i.canonicalId===b.legacyId)!;assert.equal(b.masterFieldId,masterFieldForLegacy(b.legacyId).id);
  for(const v of ['report','standard','full','audit'] as const)assert.deepEqual(b.views[v],item[v]);
  assert.deepEqual(b.metricIds,item.metricIds);assert.equal(b.status,'capability_mapping_only');
 }
});
test('source-reviewed confidence and field-state definitions preserve native types',()=>{
 const field={fieldRef:'f1',elementType:'input',inputType:'text',semanticCategory:'other',required:false,disabled:true,readOnly:true,confidence:0.7,directVsInferred:'direct'};
 // This test exercises actual producer shape; no inference from a display label.
 const category=collectionSurfaceFieldSchema._def.schema.shape.semanticCategory.options[0]!;
 assert.ok(collectionSurfaceFieldSchema.safeParse({...field,semanticCategory:category}).success);
 assert.equal(collectionSurfaceFieldSchema.safeParse({...field,semanticCategory:category,confidence:'0.7'}).success,false);
 const confidence=masterFieldForLegacy('collection.field.confidence');assert.equal(confidence.valueContract.type,'number');
 assert.equal('min' in confidence.valueContract?confidence.valueContract.min:undefined,0);
 assert.equal('max' in confidence.valueContract?confidence.valueContract.max:undefined,1);
 const state=masterFieldForLegacy('collection.field.state');assert.equal(state.valueContract.type,'object');
 assert.deepEqual(state.valueContract.nativeFields,['collectionSurfaceFieldSchema.disabled','collectionSurfaceFieldSchema.readOnly']);
});
test('page platform and version summaries are not aliases for technology detections',()=>{
 const metadata={contractVersion:'certscore.site-metadata.v1' as const,title:'Fixture',language:'en',generators:['WordPress 6.8'],wordpressAssetObserved:false};
 assert.equal(describeSiteTechnology(metadata).platform,'WordPress (declared)');
 assert.equal(matchTechnologySignal({kind:'generator',value:'WordPress 6.8',sourceUrl:'https://fixture.test/'},'https://fixture.test/'),null,'Supplemental inventory is not the page-summary identity set');
 const conflicting={...metadata,generators:['Ghost 5.1','Ghost 5.2']};
 assert.equal(describeSiteTechnology(conflicting).version,'Unknown');
 const inventory=buildTechnologyInventory(conflicting.generators.map((value,i)=>({kind:'generator' as const,value,sourceUrl:'https://fixture.test/',sourceRef:'fixture:document',evidenceRef:'site_integrity:tech-signal:'+i})),'https://fixture.test/',false);
 assert.equal(inventory.detections[0]?.versionStatus,'conflicting');
 assert.notEqual(masterFieldForLegacy('page.version').recordType,masterFieldForLegacy('technology.detection.version').recordType);
 assert.equal(masterFieldForLegacy('page.industry').layer,'context');
});
test('reviewed local source bytes and all referenced receipts remain unchanged',()=>{
 const r=verifyMasterSources();assert.equal(r.sources.length,41);
 const files=new Set<string>(r.sources.map(s=>s.file));
 for(const record of MASTER_CATALOG.records)for(const source of record.sourceReferences)assert.ok(files.has(source));
 assert.equal(MASTER_CATALOG.resolutions.find(r=>r.id==='industry_context')!.outcome,'retain_context');
});
