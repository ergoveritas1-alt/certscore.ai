import {REDHAT_OPT_OUT_TARGET,REDHAT_OPT_OUT_DOCUMENT,REDHAT_OPT_OUT_LABEL,REDHAT_OPT_OUT_POLICY,REDHAT_OPT_OUT_RECIPE,saleSharingOptOutDispatchSchema,isConsentControlInteractionEligible,type CanonicalEvidenceBundle} from '@certscore/contracts';
/** Already checksum-verified consent packet only. Opt-in stays off by default;
 * recognition does not enable the existing worker or any deployment flag. */
export function redHatConditionalDispatch(input:{bundle:CanonicalEvidenceBundle;scanId:string;targetUrl:string;sourceSha256:string;enabled:boolean}){
 if(!input.enabled||input.targetUrl!==REDHAT_OPT_OUT_TARGET||input.bundle.url!==input.targetUrl||input.bundle.scanId!==input.scanId||!/^[a-f0-9]{64}$/.test(input.sourceSha256))return null;
 const matches=input.bundle.consentUiObservations.slice(0,32).flatMap(o=>o.documentUrl===REDHAT_OPT_OUT_DOCUMENT&&o.documentIdentity?.token&&o.layerInspected==='first_layer'
  ?o.controls.slice(0,128).filter(c=>c.visible&&c.visibilityEvidence==='box_model_verified'&&c.tagName==='button'&&c.actionType==='do_not_sell_share'&&c.label===REDHAT_OPT_OUT_LABEL&&isConsentControlInteractionEligible(c)&&
   (!c.domBinding||c.domBinding.documentUrl===o.documentUrl&&c.domBinding.documentIdentity.token===o.documentIdentity!.token)).map(c=>({o,c})):[]);
 if(matches.length!==1)return null;
 const {o}=matches[0]!;
 const dispatch=saleSharingOptOutDispatchSchema.parse({enabled:true,policyVersion:REDHAT_OPT_OUT_POLICY,scanId:input.scanId,exactTargetUrl:input.targetUrl,
  redHatAuthorization:{version:'redhat.opt-out-source.v1',sourceSha256:input.sourceSha256,observationId:o.observationId,documentUrl:o.documentUrl,documentToken:o.documentIdentity!.token}});
 return {dispatch,decision:{version:'conditional_opt_out_dispatch.v3' as const,scanId:input.scanId,status:'pending' as const,reason:'supported_control' as const,controlObserved:true,supportedRoute:true,
  sourceSha256:input.sourceSha256,observationId:o.observationId,recipeVersion:REDHAT_OPT_OUT_RECIPE}};
}
