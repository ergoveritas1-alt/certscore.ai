import {domOptOutSearchSchema,scopedOptOutSearchSchema,scopedRuntimeTextLimitations,GATE_RUNTIME_TEXT_PAGE,GATE_RUNTIME_TEXT_TARGET,
 type CaliforniaPrivacyReview,type CanonicalEvidenceBundle} from '@certscore/contracts';

/** Gate-only informational observation over a newly bound runtime read. The
 * blocked consent evidence is a limitation, never an absence checkpoint. */
export function projectRuntimeOptOutSearch(review:CaliforniaPrivacyReview,bundle:CanonicalEvidenceBundle,inspectedPolicyCount:number){
 if(review.contractVersion!=='certscore.california-privacy-review.v10'||review.documentUrl!==GATE_RUNTIME_TEXT_PAGE||
  bundle.normalizedUrl!==GATE_RUNTIME_TEXT_TARGET||bundle.scanNoGoAssessment?.decision==='no_go'||
  (review.inspection?.namedChoiceCandidateCount??0)>0||(review.inspection?.unnamedControlCount??0)>0)return;
 const duration=Date.parse(bundle.completedAt)-Date.parse(bundle.startedAt);if(!Number.isFinite(duration)||duration<0)return;
 const lane=bundle.scanLaneRuns?.filter(l=>l.laneId==='runtime_evidence');
 if(lane?.length!==1||lane[0]!.executionOutcome!=='success'||lane[0]!.accessOutcome!=='representative_page'||lane[0]!.challengeDetected!==false||
  !lane[0]!.completedAt||Date.parse(lane[0]!.completedAt)>Date.parse(bundle.completedAt))return;
 const laneStart=Date.parse(lane[0]!.startedAt),laneEnd=Date.parse(lane[0]!.completedAt);
 if(!Number.isFinite(laneStart)||!Number.isFinite(laneEnd)||laneEnd<laneStart)return;
 const snapshots=bundle.runtimeMetadataSnapshots;if(snapshots?.length!==1)return;const snapshot=snapshots[0]!;
 const parsed=domOptOutSearchSchema.safeParse(snapshot.optOutSearch);if(!parsed.success||parsed.data.version!=='dom_opt_out_search.v3')return;const body=parsed.data;
 if(body.result!=='no_qualifying_signal'||body.truncated||body.bodyUsability!=='substantive_public_page'||
  body.targetUrl!==bundle.normalizedUrl||body.documentUrl!==review.documentUrl||snapshot.url!==body.documentUrl||snapshot.artifactId!==body.artifactId||
  snapshot.consentStateAtTime!=='pre_consent'||snapshot.documentIdentity?.source!=='cdp_loader_id'||snapshot.documentIdentity.token!==body.documentToken||
  snapshot.capturedAtMs<body.capturedAtMs||snapshot.capturedAtMs>duration||body.capturedAtMs>duration||
  Date.parse(bundle.startedAt)+body.capturedAtMs<laneStart||Date.parse(bundle.startedAt)+body.capturedAtMs>laneEnd)return;
 const consent=bundle.domSnapshots.filter(s=>s.artifactId==='dom_text_pre_consent');if(consent.length!==1)return;const s=consent[0]!;
 const raw=domOptOutSearchSchema.safeParse(s.optOutSearch);if(!raw.success||raw.data.version!=='dom_opt_out_search.v2')return;const blocked=raw.data;
 if(blocked.result!=='capture_unusable'||blocked.truncated||blocked.bodyUsability!=='unusable_or_unverified'||s.consentStateAtTime!=='pre_consent'||
  s.url!==review.documentUrl||blocked.documentUrl!==s.url||blocked.artifactId!==s.artifactId||s.capturedAtMs!==blocked.capturedAtMs||
  s.documentIdentity?.source!=='cdp_loader_id'||s.documentIdentity.token!==blocked.documentToken||blocked.documentToken===body.documentToken||blocked.capturedAtMs>duration)return;
 const checkpoints=bundle.consentUiObservations.filter(c=>c.observationId==='consent_ui_pre_consent');if(checkpoints.length!==1)return;const c=checkpoints[0]!;
 if(c.documentUrl!==s.url||c.documentIdentity?.source!=='cdp_loader_id'||c.documentIdentity.token!==blocked.documentToken||
  c.captureStatus!=='no_evidence'||c.controls?.length||c.visibleChoiceLabels?.length||c.observedAtMs<0||c.observedAtMs>duration)return;
 const result=scopedOptOutSearchSchema.safeParse({version:'sale_sharing_opt_out_scoped_search.v3',scope:'captured_runtime_main_document_text',
  sourceLane:'runtime_evidence',targetUrl:body.targetUrl,documentUrl:body.documentUrl,artifactId:body.artifactId,documentToken:body.documentToken,
  textSha256:body.textSha256,capturedAtMs:body.capturedAtMs,bodyUsability:body.bodyUsability,documentReadyState:body.documentReadyState,documentLanguage:body.documentLanguage,inspectedPolicyCount,
  limitations:scopedRuntimeTextLimitations(review.reviewCoverage.captureCoverage.policyTextComplete),
  consentCapture:{artifactId:blocked.artifactId,documentToken:blocked.documentToken,textSha256:blocked.textSha256,capturedAtMs:blocked.capturedAtMs,
   observationId:c.observationId,observedAtMs:c.observedAtMs}});
 return result.success?result.data:undefined;
}
