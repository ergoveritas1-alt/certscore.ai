import assert from 'node:assert/strict';
import test from 'node:test';
import {consentScopeExclusionSchema} from './consent-scope-exclusion';
import {postRefusalInteractionDiagnosticsSchema} from './post-refusal-observation';

test('scope diagnostic cannot imply actionable, successful or unrestricted consent',()=>{
 const exclusion={version:'consent_scope_exclusion.v1',reason:'aria_hidden'};
 assert.equal(consentScopeExclusionSchema.safeParse(exclusion).success,true);
 for(const value of [{...exclusion,reason:'cmp_failed'},{...exclusion,url:'https://example.test/?token=secret'}])
  assert.equal(consentScopeExclusionSchema.safeParse(value).success,false);
 const row={attempt:1,elapsedMs:1,source:'canonical_geometry',state:'scope_not_interactive',selectorMatchCount:1,visibleCount:1,enabledCount:1,labelMatchCount:1,actionableCount:0,cmpIds:[],controlLabels:['agree'],scopeExclusion:exclusion};
 const parse=(snapshot:unknown)=>postRefusalInteractionDiagnosticsSchema.safeParse({resolver:{snapshots:[snapshot],truncated:false},navigation:{outcome:'completed',documentCommitted:true,finalUrlAuthorized:true},click:{outcome:'not_attempted',reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}});
 assert.equal(parse(row).success,true);
 for(const mutated of [{...row,state:'single_actionable'},{...row,actionableCount:1}])assert.equal(parse(mutated).success,false);
 const legacy={...row};delete (legacy as any).scopeExclusion;assert.equal(parse(legacy).success,true);
});
