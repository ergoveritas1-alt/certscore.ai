// Synthetic offline evidence; never a retained-site assertion.
const h='a'.repeat(64);
const frame={locatorHash:'b'.repeat(64),frameDocumentHash:'c'.repeat(64),reason:'display_none',depth:0,locatorLimited:false};
export const selfHiddenFrameFixture=()=>({contractVersion:'certscore.privacy-choice-inspection.v5',documentUrl:'https://fixture.test/',capturedAt:'2026-10-23T00:00:00.000Z',sourceHash:h,
  scope:'rendered_named_links_and_buttons',coverage:'limited',namedChoiceCandidateCount:0,unnamedControlCount:0,candidateEnumerationTruncated:false,
  uninspectedFrameCount:1,uninspectedShadowRootCount:0,supportedDocumentLanguage:true,representativeDocument:true,documentStable:true,
  hiddenUnnamedControlCount:0,frameCount:1,inspectedSameOriginFrameCount:0,hiddenUninspectedFrameCount:1,inaccessibleFrameCount:0,unreadyFrameCount:0,
  unprojectableFrameCount:0,frameBudgetLimitedCount:0,namedFrameChoiceCandidateCount:0,frameInspectionWorkMs:0,frameProofWorkMs:0,
  homepageAccessPolicy:'representative_homepage.v1',readinessPolicy:'document_bound_dom_inventory.v1',documentReadyState:'complete',limitationKeys:['frame_inventory_incomplete'],
  diagnostics:{version:'privacy_choice_diagnostics.v1',inspectionSourceHash:h,firstDocumentHash:'d'.repeat(64),secondDocumentHash:'d'.repeat(64),
    identityBasis:'document_and_structural_locator_only',status:'captured',limitations:[] as string[],unnamedControls:[],frames:[{first:{...frame},second:{...frame}}],
    checkpointIdentity:{version:'privacy_frame_checkpoint_identity.v1',scope:'sampled_frame_checkpoint_identity_only',identityBasis:'dom_reference_equality',status:'matched',parentDocument:'same',frames:[{slot:0,node:'same',document:'same'}],limitations:[] as string[]}}});

