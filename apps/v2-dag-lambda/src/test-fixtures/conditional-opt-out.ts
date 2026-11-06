import {canonicalEvidenceBundleSchema, consentUiObservationSchema} from '@certscore/contracts';
import {gpcRuntimeFixture} from '../../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime';
export function conditionalConsentFixture(scanId='conditional-fixture') {
 const bundle=gpcRuntimeFixture({enabled:false,url:'https://example.com/'});bundle.scanId=scanId;
 bundle.consentUiObservations=[consentUiObservationSchema.parse({observationId:'supported-control',observedAtMs:1000,documentUrl:bundle.url,documentIdentity:{source:'cdp_loader_id',token:'consent-document'},likelyPresent:true,confidence:1,basis:['dom_inventory'],layerInspected:'first_layer',controls:[{label:'Do Not Sell or Share My Personal Information',actionType:'do_not_sell_share',tagName:'button',selectorHint:'button#ot-sdk-btn.ot-sdk-show-settings',visible:true,layer:'first_layer',visibilityEvidence:'box_model_verified',consentContextEvidence:'local_surface'}]})];
 return canonicalEvidenceBundleSchema.parse(bundle);
}
