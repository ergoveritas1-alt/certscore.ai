/** Offline review of retained source/citation relationships, never findings. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,statSync} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {verifiedLocalBytes,inspectPolicyCapture,readPolicyDocument}=require("./lib/daily-policy-audit");
const {bindPolicyCitation}=require("./lib/policy-citation-binding");
const {article13DisclosureRejectReason}=require("../packages/certscore-contracts/src/article13-disclosure-rejection");
const {extractPolicySections,gdprTransparencyTopicCandidatesFromRetainedPolicySections}=require("../packages/certscore-scan-core/src/scanners/policy-surface-scanner");
const {adaptGdprTransparencyTopicCandidatesForProduction}=require("../apps/web/lib/scans/gdpr-transparency-topic-evidence-adapter");
const {GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE}=require("../apps/web/lib/scans/gdpr-transparency-production-profile");
const {buildNormalizedConcerns}=require("../apps/web/lib/scans/normalized-concerns");
const {deriveGdprEprivacyCoveragePolicyOutcomes}=require("../apps/web/lib/scans/gdpr-eprivacy-coverage-policy");
const {deriveGdprEprivacyCoverageChecklist}=require("../apps/web/lib/scans/gdpr-eprivacy-coverage-checklist");
const [casesFile,originsFile,out]=process.argv.slice(2);
if(!casesFile||!originsFile||!out||existsSync(out))throw Error("Supply cases.json origins.json and fresh output");
const read=(p:string)=>{if(statSync(p).size>80_000_000)throw Error("Input exceeds bound");return JSON.parse(readFileSync(p,"utf8"));};
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const cases=read(casesFile),origins=read(originsFile),results:any[]=[];
if(!Array.isArray(cases)||cases.length>20||origins.readOnly!==true)throw Error("Bounded retained inputs required");
globalThis.fetch=async()=>{throw Error("Network forbidden in retained source review");};
for(const c of cases){
  const origin=origins.rows.find((r:any)=>r.scanId===c.scanId);
  if(origin?.isMacMini!==true||origin?.isCanary!==false||!origin.originalRequestId)throw Error("Original ordinary Mac mini provenance required");
  const root=realpathSync(c.run),seal=read(path.join(root,"pass-a-seal.json")),sealedFile=realpathSync(seal.file);
  if(!sealedFile.startsWith(root+path.sep)||sha(readFileSync(sealedFile))!==seal.sha256)throw Error("Independent source seal mismatch");
  const receipts=read(path.join(root,"evidence-retrieval-receipts.json")),support=read(path.join(root,"support-retrieval-receipts.json"));
  const candidates=receipts.filter((r:any)=>r.scanId===c.scanId&&r.kind==="scanArtifactUri"&&(r.eventIndex===undefined||r.eventIndex===0));
  if(candidates.length!==1)throw Error("Ambiguous original bundle");
  const receipt=candidates[0],inventory=read(path.join(root,"work-inventory-v2.json")),original=inventory.find((r:any)=>r.id===c.scanId)?.retained?.[0];
  if(original?.pointers?.scanArtifactUri!==receipt.uri||original?.hashes?.scanArtifactUri?.sha256!==receipt.expected?.sha256||original?.hashes?.scanArtifactUri?.sizeBytes!==receipt.expected?.sizeBytes)throw Error("Original event binding mismatch");
  const bytes=verifiedLocalBytes(root,receipt,20_000_000),bundle=JSON.parse(bytes.toString("utf8"));if(bundle.scanId!==c.scanId)throw Error("Bundle identity mismatch");
  const observation=bundle.policySurfaceObservations.find((o:any)=>o.observationId===c.documentKey);if(!observation)throw Error("Missing original policy observation");
  const capture=inspectPolicyCapture({root,scanId:c.scanId,site:new URL(bundle.url).hostname,region:bundle.region,status:"completed",bundle,receipts:support});
  const doc=capture.documents.find((d:any)=>d.key===c.documentKey);if(!doc?.file||!doc.url)throw Error("Verified full policy text unavailable");
  const text=readPolicyDocument(root,doc),signals=observation.article13DisclosureSignals.filter((s:any)=>c.topics.includes(s.disclosureType));
  const citations=signals.map((signal:any)=>{const quote=signal.selectedPolicySectionExcerpt??signal.evidenceText;return {topic:signal.disclosureType,quote,
    binding:bindPolicyCitation({sourceUrl:doc.url!,text,textSha256:doc.file!.sha256,quote,topic:signal.disclosureType,sections:observation.retainedPolicySections??[],witnesses:observation.retainedArticle13SectionEvidence??[]}),
    currentSharedValidator:article13DisclosureRejectReason(quote,signal.disclosureType,{mode:"retained_report"})??"accepted; meaning and ownership still require review"};});
  const dpoSections=(observation.retainedPolicySections??[]).filter((s:any)=>/datenschutzbeauftrag|data protection officer|\bdpo\b/i.test(s.heading+" "+s.textExcerpt)).map((s:any)=>({heading:s.heading,quote:s.textExcerpt,sourceUrl:s.sourceUrl,offsetBasis:s.sourceOffsetBasis,sourceCharStart:s.charStart,sourceCharEnd:s.charEnd,evidenceTextSha256:s.evidenceTextSha256,sourceDocumentSha256:s.documentTextSha256}));
  const currentSections=extractPolicySections({html:"",visibleText:text,sourceUrl:doc.url});
  const topicCandidates=gdprTransparencyTopicCandidatesFromRetainedPolicySections(currentSections);
  const adaptationInput={policyTextQuality:{usable:true},profile:GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,surface:{...observation,gdprTransparencyTopicCandidates:topicCandidates,article13DisclosureSignals:[]}};
  const targetOwned=observation.documentRole==="policy_document"&&["target_controller","first_party_brand"].includes(observation.targetRelationship);
  const adaptation=adaptGdprTransparencyTopicCandidatesForProduction({...adaptationInput,isTargetRelevantPrivacyPolicy:targetOwned});
  if(adaptGdprTransparencyTopicCandidatesForProduction({...adaptationInput,isTargetRelevantPrivacyPolicy:false}).acceptedProductionSignals.length)throw Error("Ownership gate bypass");
  const controllerSignals=adaptation.acceptedProductionSignals.filter((s:any)=>s.disclosureType==="controller_contact");
  const runtimeArtifacts={policyDisclosureSummary:{article13DisclosureSignals:controllerSignals,gdprTransparencyEvidenceProfile:adaptation.profile,gdprTransparencyProductionEvidenceEnabled:adaptation.productionEvidenceEnabled}};
  const normalizedConcerns=buildNormalizedConcerns({runtimeArtifacts,reviewFindingCandidates:[],validationFindings:[]});
  const outcomes=deriveGdprEprivacyCoveragePolicyOutcomes({coverageLimited:false,events:[],normalizedConcerns,runtimeArtifacts,scanCompleted:true,snapshot:{}});
  const checklist=deriveGdprEprivacyCoverageChecklist({coverageLimited:false,coverageOutcomes:outcomes,projectedFindings:[],unifiedFindings:[],scanCompleted:true});
  const counterfactualController={scope:"Verified plain-text re-extraction through canonical pipeline; no historical materialization or DPO promotion",signals:controllerSignals.map((s:any)=>({quote:s.evidenceText,selectedUrl:s.selectedPolicySectionUrl})),normalizedConcernCount:normalizedConcerns.filter((n:any)=>n.originKey==="gdpr_transparency.article13.controller_contact").length,checklistState:checklist.find((r:any)=>r.id==="controller_contact_disclosure")?.evidenceState??"not_checked"};
  if(c.assertControllerObserved===true&&counterfactualController.checklistState!=="observed")throw Error("Retained controller recovery failed");
  results.push({scanId:c.scanId,site:new URL(bundle.url).hostname,originalRequestId:origin.originalRequestId,documentKey:c.documentKey,sourceUrl:doc.url,
    source:{bundle:receipt.localPath,bundleSha256:sha(bytes),textFile:path.join(root,doc.file.relativePath),textSha256:doc.file.sha256},
    counterfactualController,producerDeclaredOwnership:observation.targetRelationship,producerDeclaredOwner:observation.documentOwnerEntity??null,citations,dpoSections,
    independentlyVerifiedGoverningOwnership:"not_assessed",newFindings:0,historicalWrites:0});
}
mkdirSync(out,{recursive:true});
writeFileSync(path.join(out,"binding-review.json"),JSON.stringify({version:"certscore.policy-binding-review.v1",scope:"Original Mac mini citations; not another full governing-policy review",results,productionCalls:0,newScans:0,modelCalls:0,newFindings:0},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(results.map(r=>({scanId:r.scanId,citations:r.citations.map((c:any)=>({topic:c.topic,binding:c.binding.status})),dpoSections:r.dpoSections.length}))));
