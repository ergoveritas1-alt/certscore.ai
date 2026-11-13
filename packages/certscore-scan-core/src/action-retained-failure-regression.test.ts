import assert from 'node:assert/strict';
import test from 'node:test';
import {postRefusalInteractionDiagnosticsSchema} from '../../certscore-contracts/src/post-refusal-observation.js';
import {bindPostRefusalBrowserResolvedExactTarget,RESOLVED_SCAN_TARGET_AUTHORIZATION_ID} from './post-refusal-target-authorization.js';

// Retained myasiantv.es / mydesi10.com workers failed with an all-redacted
// four-segment too_big diagnostic before action. This reproduces the redirect
// diagnostic overflow candidate; retained logs do not establish the exact field.
for (const action of ['accept','reject']) test(`${action}: excessive redirects retain a failed authorization diagnostic`,async()=>{
 const authorization={kind:'scan_target_resolution' as const,authorizationId:RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,scanId:'retained-redirect',requestedUrl:'https://example.test/',maxRedirects:8,resolutionTimeoutMs:1000};
 let guards=0;
 const resolution=await bindPostRefusalBrowserResolvedExactTarget({durationMs:3200,finalUrl:'https://other.test/',redirectCount:9,requestedUrl:authorization.requestedUrl},authorization,authorization.scanId,{urlGuard:async u=>{guards++;return new URL(u);}});
 assert.equal(resolution.status,'failed');assert.equal(guards,0);
 const diagnostic={navigation:{outcome:'completed',documentCommitted:true,finalUrlAuthorized:false,redirectResolution:resolution},click:{outcome:'not_attempted',reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}};
 assert.equal(postRefusalInteractionDiagnosticsSchema.safeParse(diagnostic).success,true);
 assert.equal(resolution.redirectCount,9);
 assert.equal(postRefusalInteractionDiagnosticsSchema.safeParse({...diagnostic,navigation:{...diagnostic.navigation,finalUrlAuthorized:true,redirectResolution:{...resolution,status:'resolved',failureReason:undefined,finalExactTargetSha256:'a'.repeat(64)}}}).success,false);
});
