import assert from 'node:assert/strict';
import {S3Client} from '@aws-sdk/client-s3';
import {isConsentControlInteractionEligible, classifyConsentControlLabel, saleSharingExactRouteAuthorization, saleSharingApexWwwCounterpart, SALE_SHARING_REDIRECT_POLICY, SALE_SHARING_EXACT_ROUTE_POLICY, REDHAT_OPT_OUT_POLICY, saleSharingOptOutDispatchSchema, type CanonicalEvidenceBundle, type SaleSharingCanaryLedger} from '@certscore/contracts';
import {KNOWN_CMP_REGISTRY} from '@website-signal-risk-scanner/shared';
import {createSaleSharingCanaryStore} from './sale-sharing-canary-store';

/** Recognition from the already hash-verified consent source. The worker must
 * independently retain the entire exact redirect chain and recheck the control. */
export function reviewedRouteDispatch(input:{bundle:CanonicalEvidenceBundle;scanId:string;targetUrl:string;sourceSha256:string}) {
  const route=saleSharingExactRouteAuthorization(input.targetUrl),alternate=saleSharingApexWwwCounterpart(input.targetUrl);
  if((!route && !alternate) || input.bundle.scanId!==input.scanId || input.bundle.url!==input.targetUrl || !/^[a-f0-9]{64}$/.test(input.sourceSha256))return null;
  const matches=input.bundle.consentUiObservations.slice(0,32).flatMap(o=>{
    if(o.documentUrl!==(route?.targets.at(-1)??alternate) || !o.documentIdentity?.token || o.layerInspected!=='first_layer')return [];
    return o.controls.slice(0,128).flatMap(c=>{
      if(!c.visible || c.visibilityEvidence!=='box_model_verified' || !isConsentControlInteractionEligible(c) ||
        (c.domBinding && (c.domBinding.documentUrl!==o.documentUrl || c.domBinding.documentIdentity.token!==o.documentIdentity!.token)))return [];
      const recipes=KNOWN_CMP_REGISTRY.flatMap(d=>d.saleSharingOptOut?.settingsEntrances??[]);
      const match=recipes.find(recipe=>recipe.originalTargetUrl===input.targetUrl && recipe.actionTargetUrl===o.documentUrl &&
        recipe.labels.includes(c.label.trim().toLowerCase().replace(/\s+/g,' ')) &&
        ((c.tagName==='button' && c.selectorHint===recipe.buttonSelector) || (c.tagName==='a' && recipe.anchorSelector && c.selectorHint===recipe.anchorSelector)));
      if(match)return [{o,recipeVersion:match.version}];
      const direct=classifyConsentControlLabel({label:c.label,usage:'action',hasConsentContext:o.likelyPresent,hasPreferenceContext:c.consentContextEvidence==='local_surface'});
      if(c.actionType!=='do_not_sell_share' || direct.intent!=='privacy_opt_out' || direct.matchStrength!=='direct' || c.tagName!=='button' || c.consentContextEvidence!=='local_surface')return [];
      const supported=KNOWN_CMP_REGISTRY.map(d=>d.saleSharingOptOut).find(recipe=>recipe && recipe.entranceLabels?.includes(c.label.trim().toLowerCase().replace(/\s+/g,' ')) &&
        (c.selectorHint===recipe.entranceSelector || recipe.entranceSelector==='button.ot-sdk-show-settings' && (c.selectorHint==='#ot-sdk-btn' || /^button(?:#[A-Za-z0-9_-]+)?(?:\.[A-Za-z0-9_-]+)+$/.test(c.selectorHint??'') && c.selectorHint!.split('.').slice(1).includes('ot-sdk-show-settings'))));
      return supported?[{o,recipeVersion:supported.version}]:[];
    });
  });
  if(matches.length!==1)return null;
  const {o,recipeVersion}=matches[0]!;
  const dispatch=saleSharingOptOutDispatchSchema.parse({enabled:true,policyVersion:route?SALE_SHARING_EXACT_ROUTE_POLICY:SALE_SHARING_REDIRECT_POLICY,scanId:input.scanId,exactTargetUrl:input.targetUrl,...(route?{exactRouteAuthorization:route}:{redirectAuthorization:{version:"sale_sharing_apex_www.v1",alternateTargetUrl:alternate}}),
    rolloutSource:{version:'reviewed_opt_out_source.v1',sourceSha256:input.sourceSha256,observationId:o.observationId,documentUrl:o.documentUrl,documentToken:o.documentIdentity!.token}});
  return {dispatch,decision:{version:'conditional_opt_out_dispatch.v3' as const,scanId:input.scanId,status:'pending' as const,reason:'supported_control' as const,controlObserved:true,supportedRoute:true,sourceSha256:input.sourceSha256,observationId:o.observationId,recipeVersion}};
}

/** Owner-enabled production authorization replaces administrative canary slots,
 * while atomic per-scan claims preserve at-most-once action dispatch. */
export async function claimReviewedOptOutRollout(input:{stage:'coordinator'|'worker';scanId:string;targetUrl:string;region:string;functionName:string;dispatch:unknown;parentDispatchSha256?:string},
 options:{ledger?:SaleSharingCanaryLedger;signal?:AbortSignal;deadlineAtMs?:number;runtime?:{buildGitSha?:string;functionVersion?:string;region?:string;memoryMb?:number;functionName?:string}}={}) {
  assert.equal(process.env.CERTSCORE_REVIEWED_OPT_OUT_ROLLOUT_ENABLED,'1','reviewed_opt_out_rollout_disabled');
  assert.equal(process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED,'1','opt_out_worker_disabled');
  const config=saleSharingOptOutDispatchSchema.parse(input.dispatch);
  assert.equal(config.scanId,input.scanId);assert.equal(config.exactTargetUrl,input.targetUrl);
  assert.ok(/^[A-Za-z0-9_-]{1,160}$/.test(input.scanId));
  assert.ok(/^[a-f0-9]{64}$/.test(input.parentDispatchSha256??''),'reviewed_opt_out_parent_missing');
  assert.ok(config.policyVersion===REDHAT_OPT_OUT_POLICY || config.policyVersion===SALE_SHARING_EXACT_ROUTE_POLICY || config.policyVersion===SALE_SHARING_REDIRECT_POLICY);
  const source=config.policyVersion===REDHAT_OPT_OUT_POLICY?config.redHatAuthorization:config.rolloutSource;
  assert.ok(source,'reviewed_opt_out_source_missing');
  if(config.policyVersion===REDHAT_OPT_OUT_POLICY)assert.equal(process.env.CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED,'1');
  else assert.equal(source.documentUrl,config.policyVersion===SALE_SHARING_EXACT_ROUTE_POLICY?config.exactRouteAuthorization!.targets.at(-1):config.redirectAuthorization!.alternateTargetUrl);
  const runtime=options.runtime??{buildGitSha:process.env.BUILD_GIT_SHA,functionVersion:process.env.AWS_LAMBDA_FUNCTION_VERSION,region:process.env.AWS_REGION,memoryMb:Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE),functionName:process.env.AWS_LAMBDA_FUNCTION_NAME};
  const verify=()=>{
    assert.ok(['us-west-1','eu-west-1','eu-central-1'].includes(input.region));
    assert.equal(runtime.region,input.region);assert.equal(runtime.memoryMb,3008);
    assert.ok(/^[a-f0-9]{40}$/.test(runtime.buildGitSha??''));
    assert.ok(runtime.functionName && runtime.functionVersion);
    assert.ok(input.functionName===runtime.functionName || input.functionName===`${runtime.functionName}:${runtime.functionVersion}`,'reviewed_opt_out_runtime_mismatch');
    options.signal?.throwIfAborted();
  };
  verify();
  const remaining=Math.min(500,(options.deadlineAtMs??Infinity)-Date.now());assert.ok(remaining>0,'reviewed_opt_out_deadline');
  const signal=AbortSignal.any([AbortSignal.timeout(Math.max(1,Math.floor(remaining))),...(options.signal?[options.signal]:[])]);
  const bucket=process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  assert.ok(options.ledger || bucket,'reviewed_opt_out_store_unavailable');
  const ledger=options.ledger??createSaleSharingCanaryStore({bucket:bucket!},signal,new S3Client({region:input.region,maxAttempts:1}));
  const key=`v2-dag-lambda/local/reviewed-opt-out-rollout/${input.scanId}`;
  const claim={version:'reviewed_opt_out_claim.v1',scanId:input.scanId,targetUrl:input.targetUrl,region:input.region,functionName:input.functionName,buildGitSha:runtime.buildGitSha,functionVersion:runtime.functionVersion,source,parentDispatchSha256:input.parentDispatchSha256,policyVersion:config.policyVersion};
  let listener:()=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{listener=()=>reject(Error('reviewed_opt_out_deadline'));signal.addEventListener('abort',listener,{once:true});if(signal.aborted)listener();});
  try { await Promise.race([aborted,(async()=>{
    if(input.stage==='worker')assert.deepEqual(await ledger.read(`${key}/coordinator.json`),claim,'reviewed_opt_out_parent_claim_mismatch');
    await ledger.create(`${key}/${input.stage}.json`,claim);
  })()]); } finally {signal.removeEventListener('abort',listener);}
  signal.throwIfAborted();verify();
}
