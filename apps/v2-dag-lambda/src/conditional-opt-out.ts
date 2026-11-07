import {classifyConsentControlLabel, isConsentControlInteractionEligible, type CanonicalEvidenceBundle} from '@certscore/contracts';
import {KNOWN_CMP_REGISTRY} from '@website-signal-risk-scanner/shared';

export type {ConditionalOptOutDecision} from '@certscore/contracts';
import {type ConditionalOptOutDecision, explicitOptOutEntranceName, BOUND_OPT_OUT_RECIPE} from '@certscore/contracts';

/** Scheduling eligibility only, from an already checksum-verified consent artifact.
 * The independent worker rechecks the live DOM, geometry, label, state and route.
 * No policy text, generic Settings, unreviewed links, or inferred CMP identities authorize dispatch. */
export function conditionalOptOutCandidate(input:{bundle:CanonicalEvidenceBundle;scanId:string;targetUrl:string;sourceSha256:string;boundControls?:boolean}):ConditionalOptOutDecision {
  const no=(reason:ConditionalOptOutDecision['reason']):ConditionalOptOutDecision=>({version:'conditional_opt_out_dispatch.v3',scanId:input.scanId,status:'skipped',reason});
  if(input.bundle.scanId!==input.scanId||!/^[a-f0-9]{64}$/.test(input.sourceSha256))return no('source_unverified');
  if(input.bundle.url!==input.targetUrl||new URL(input.targetUrl).protocol!=='https:')return no('target_changed');
  let observedControlId:string|undefined;
  const matches:Array<{observationId:string;recipeVersion:string;selector:string;token:string;nativeLocator?:string}>=[];
  for(const observation of input.bundle.consentUiObservations.slice(0,32)) {
    if(!observation.documentIdentity?.token||observation.layerInspected!=='first_layer')continue;
    for(const control of observation.controls.slice(0,128)) {
      if(!control.visible||control.visibilityEvidence==='unverified'||(control.layer!==undefined&&control.layer!=='first_layer')||control.actionType!=='do_not_sell_share')continue;
      // Presence in the verified source does not authorize its redirect or any
      // action. Retain this fact before applying the unchanged execution gate.
      const binding=control.domBinding;
      if(!observedControlId && observation.documentUrl && /^https?:\/\//.test(observation.documentUrl) &&
        isConsentControlInteractionEligible(control) &&
        (control.semanticallyInteractive===true||['button','link'].includes(control.role??'')||['button','a','input','summary'].includes(control.tagName??'')) &&
        (!binding||(binding.documentUrl===observation.documentUrl&&binding.documentIdentity.token===observation.documentIdentity.token))) {
        const presence=classifyConsentControlLabel({label:control.label,usage:'action',hasConsentContext:observation.likelyPresent,hasPreferenceContext:control.consentContextEvidence==='local_surface'});
        if(presence.intent==='privacy_opt_out'&&presence.matchStrength==='direct')observedControlId??=observation.observationId;
      }
      if(observation.documentUrl!==input.targetUrl||control.consentContextEvidence!=='local_surface')continue;
      const bound=control.domBinding?.optOutControl;
      if(input.boundControls && bound && control.domBinding?.documentUrl===input.targetUrl &&
        control.domBinding.documentIdentity.token===observation.documentIdentity.token && bound.accessibleLabel===control.label &&
        control.selectorHint===`ax:${control.domBinding.axNodeId}` && ['button','a'].includes(control.tagName??'') &&
        control.visibilityEvidence==='box_model_verified'){
        matches.push({observationId:observation.observationId,recipeVersion:BOUND_OPT_OUT_RECIPE,selector:`ax:${control.domBinding.backendNodeId}:${bound.selector}`,nativeLocator:bound.selector,token:observation.documentIdentity.token});continue;
      }
      if(control.tagName!=='button' && !(input.boundControls&&control.tagName==='a'&&control.linkDestination==='same_document'))continue;
      const label=input.boundControls ? explicitOptOutEntranceName(control.label)??'' : control.label.trim().toLowerCase().replace(/\s+/g,' ');
      const semantic=classifyConsentControlLabel({label:control.label,usage:'action',hasConsentContext:true,hasPreferenceContext:true});
      if(semantic.intent!=='privacy_opt_out'||semantic.matchStrength!=='direct')continue;
      for(const definition of KNOWN_CMP_REGISTRY){
        const recipe=definition.saleSharingOptOut;if(!recipe?.entranceLabels?.includes(label))continue;
        // Only the reviewed native button selector. Extra ID/classes are allowed,
        // or the exact native OneTrust ID emitted by DOM inventory. The worker
        // independently requires the recipe class before any action.
        const selector=control.selectorHint??'';
        const anchor=input.boundControls&&control.tagName==='a'&&/^a(?:#[A-Za-z0-9_-]+)?(?:\.[A-Za-z0-9_-]+)+$/.test(selector)&&selector.split('.').slice(1).includes('ot-sdk-show-settings');
        const banner=input.boundControls&&control.tagName==='button'&&['#onetrust-pc-btn-handler','button#onetrust-pc-btn-handler'].includes(selector)&&recipe.entranceSelector==='button.ot-sdk-show-settings';
        const matchesSelector=banner||anchor||selector===recipe.entranceSelector || recipe.entranceSelector==='button.ot-sdk-show-settings'&&
          (selector==='#ot-sdk-btn'||/^button(?:#[A-Za-z0-9_-]+)?(?:\.[A-Za-z0-9_-]+)+$/.test(selector)&&selector.split('.').slice(1).includes('ot-sdk-show-settings'));
        if(matchesSelector)matches.push({observationId:observation.observationId,recipeVersion:input.boundControls?BOUND_OPT_OUT_RECIPE:recipe.version,selector:banner?'button#onetrust-pc-btn-handler':selector,token:observation.documentIdentity.token});
      }
    }
  }
  // A same-document exact-ID DOM row can corroborate an AX binding. Keep
  // different AX backend nodes distinct even when they advertise that same ID.
  const joined=matches.filter(m=>m.selector!=='button#onetrust-pc-btn-handler'||!matches.some(other=>other.token===m.token&&other.nativeLocator===m.selector));
  const distinct=[...new Map(joined.map(m=>[`${m.token}/${m.selector}/${m.recipeVersion}`,m])).values()];
  if(distinct.length!==1)return {...no(distinct.length?'ambiguous_control':'unsupported_or_unverified_control'),sourceSha256:input.sourceSha256,controlObserved:observedControlId!==undefined,...(observedControlId?{observationId:observedControlId}:{}),supportedRoute:false};
  return {version:'conditional_opt_out_dispatch.v3',scanId:input.scanId,status:'pending',reason:'supported_control',controlObserved:true,supportedRoute:true,sourceSha256:input.sourceSha256,
    observationId:distinct[0]!.observationId,recipeVersion:distinct[0]!.recipeVersion};
}
