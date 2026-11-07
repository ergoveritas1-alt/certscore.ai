import {reportRequestScanFixture} from '../../apps/web/server/scans/report-forms.fixture';
import {buildCanonicalReportExport} from '../../apps/web/server/scans/report-export';
import {reportCmpEvidenceFixture,reportTechnicalEvidenceFixture} from '../../apps/web/server/scans/report-appendix-evidence.fixture';
import {gpcProductFixture} from '../../apps/web/lib/scans/test-fixtures/gpc-product';
import {buildUnifiedFindingDisplayPackets} from '../../apps/web/lib/scans/unified-findings';
import {accessibilityProjectionFixture} from '../../packages/certscore-contracts/src/accessibility-audit.fixture';
import terminal from '../../apps/web/lib/scans/test-fixtures/retained-terminal-confirmations.json';
export function documentFixture(focus:'gdpr_eprivacy'|'ccpa_cpra',choices=false,notReady=false,lateCollection=false){
 const scan=reportRequestScanFixture(),cmp=reportCmpEvidenceFixture(scan.scan.id,2),tech=reportTechnicalEvidenceFixture(scan.scan.id);
 cmp.assessment.scan.requestedUrl='https://example.test/';cmp.assessment.scan.finalUrl='https://example.test/';
 scan.runtimeArtifacts={...scan.runtimeArtifacts,cmpVendorName:'OneTrust',consentControlAssessment:cmp.assessment,accessibilityAudit:accessibilityProjectionFixture({scanId:scan.scan.id})};
 scan.runtimeArtifacts.siteMetadata={contractVersion:'certscore.site-metadata-projection.v1',sourceHash:'a'.repeat(64),documentUrl:cmp.assessment.scan.finalUrl??cmp.assessment.scan.requestedUrl,evidenceRef:'owned:metadata',capturedAtMs:123,
  observation:{contractVersion:'certscore.site-metadata.v1',title:'Owned fixture title',language:'en',generators:['WordPress 6.8.2'],wordpressAssetObserved:true}};
 scan.snapshot={...scan.snapshot,report_projection_status:'ready',report_projection_source_hash:'c'.repeat(64),report_projection_version:'scan-report-projection-v27'} as typeof scan.snapshot;
 const crop={x:1,y:1,width:20,height:20,imageWidth:100,imageHeight:100,screenshotSha256:'d'.repeat(64)};
 scan.runtimeArtifacts.visualEvidenceArtifacts=[{id:'owned-image',key:'owned-fixture/image.png',status:'available',sha256:'d'.repeat(64),pageUrl:'https://example.test/',width:100,height:100,
  bannerCrop:{...crop,version:'consent_banner_crop.v1'},rejectCrop:{...crop,version:'consent_control_crop.v1',control:'reject'},prominenceCrop:{...crop,version:'consent_prominence_crop.v1'}}];
 scan.canonicalReportProjection.normalizedConcerns=cmp.normalizedConcerns;
 const g=gpcProductFixture({scanId:scan.scan.id,...(lateCollection?{urls:['https://example.test/late-noise','https://www.facebook.com/tr/?id=12345&ev=PageView']}:{}),priorCmpState:!notReady,...(notReady?{notReady:'cmp_status_not_loaded' as const}:{})});
 const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:g.assessment,gpcActivityComparison:g.activityComparison,gpcCmpStateComparison:g.cmpStateComparison},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
 scan.canonicalReportProjection.globalUnifiedFindings=findings;scan.canonicalReportProjection.ownerUnifiedFindings=findings;
 if(choices)for(const f of terminal)(scan.runtimeArtifacts as Record<string,unknown>)[f.action==='accept'?'postAcceptEvidenceProjection':'postRefusalEvidenceProjection']=f.projection;
 const report=buildCanonicalReportExport(scan,undefined,focus)!;report.appendix.evidenceDossier.cmsSecurity=tech.cms;
 return {scan,report};
}
