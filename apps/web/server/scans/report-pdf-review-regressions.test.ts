import assert from 'node:assert/strict';
import test from 'node:test';
import {pdfPublicWords} from './report-pdf-reader';
import {reportBrandDisplayName} from '../../lib/scans/report-brand-display-name';
import {renderCanonicalReportPdf} from './report-export-pdf';
import {priorityReportFixture} from './report-priority.fixture';
import {pdfChoicePathEvidence} from './report-pdf-appendices';
import {afterRejectScoringAssessmentSchema,AFTER_REJECT_SCORING_POLICY} from '../../lib/scans/after-reject-scoring-contract';

test('PDF phrasing preserves sentence verbs and normalizes missing values',()=>{
 for(const source of ['Evidence was not retained for this check.','No insecure observed form transport was retained for the scanned page.','Privacy notice evidence was retained in public policy-surface evidence.']) {
  assert.equal(pdfPublicWords(source),source.replace('retained','recorded'));
 }
 assert.equal(pdfPublicWords('Not Not retained'),'Not recorded');
});
test('shareable branding excludes account emails and preserves organizational names and Latin characters',()=>{
 assert.equal(reportBrandDisplayName('owner@example.test workspace'),'CertScore.ai');
 assert.equal(reportBrandDisplayName('Prüfung GmbH'),'Prüfung GmbH');
 const report=priorityReportFixture(),before=JSON.stringify(report);
 const pdf=renderCanonicalReportPdf(report,{brandName:'owner@example.test workspace'}).toString('latin1');
 assert.ok(!pdf.includes('owner@example.test'));assert.match(pdf,/CertScore\.ai/);
 const named=renderCanonicalReportPdf(report,{brandName:'Prüfung GmbH'}).toString('latin1');
 assert.ok(named.includes('Prüfung GmbH'));assert.match(named,/\/Encoding \/WinAnsiEncoding/);
 assert.equal(JSON.stringify(report),before);
});
test('post-Reject cookie snapshots are exposed separately, including later sample times, without values',()=>{
 const report=priorityReportFixture();
 const assessment=afterRejectScoringAssessmentSchema.parse({policyVersion:AFTER_REJECT_SCORING_POLICY,
  registration:'confirmed',tier:'high_risk',deductionPoints:15,sourcePacketSha256:'a'.repeat(64),requestIds:[],
  cookieRefs:[{name:'_ga',hostname:'example.test',valueHash:'b'.repeat(64)}],reasons:['verified_optional_activity','nonessential_cookies_after_reject'],
  entityEvidence:{resolverVersion:'fixture',entities:[{entityId:'ent_123456789abc',entity:'Example Analytics',vendor:'Example'}],observations:[{kind:'cookie_snapshot',evidenceRef:'cookie:fixture',name:'_ga',hostname:'example.test',purpose:'analytics',msAfterClick:2092,entityId:'ent_123456789abc',entity:'Example Analytics',vendor:'Example'}]}});
 report.projection.unifiedFindings.push({unifiedFindingId:'post_reject_click_tracking',concernContext:{afterRejectScoringAssessment:assessment}} as never);
 report.appendix.evidenceDossier!.cmp!.audit.rows=[{supportingEvidence:{inventory:{choiceActivity:[{action:'reject',clockOrigin:'action_click',windowMs:1388,requestCount:0,nonEssentialRequestCount:0,requests:[]}]}}}] as never;
 const before=JSON.stringify(report);
 const lines=pdfChoicePathEvidence(report,{text:text=>[{text:String(text)}],heading:text=>({text})});
 const text=lines.map(l=>l.text).join(' ');assert.match(text,/Post-Reject cookie snapshots/);assert.match(text,/_ga.*example.test/);assert.match(text,/2092 ms/);assert.match(text,/separately from the request window/);
 assert.ok(!text.includes('b'.repeat(64)));assert.equal(JSON.stringify(report),before);
});

test('unknown confirmed-refusal timing is not printed as a verified zero activity count',()=>{
 const report=priorityReportFixture();
 report.appendix.evidenceDossier!.rejectTiming={inFlightExclusionVerified:false,windowMs:3000,networkRequestCount:0,storageWriteCount:0,networkRequests:[],registrationTimeIsUpperBound:false};
 report.appendix.evidenceDossier!.cmp!.audit.rows=[{supportingEvidence:{inventory:{choiceActivity:[{action:'reject',windowMs:3000,requestCount:1,nonEssentialRequestCount:1,requests:[{hostname:'collector.example',path:'/event',vendor:'Example',purpose:'analytics',msAfterClick:284,nonEssential:true}]}]}}}] as never;
 const text=pdfChoicePathEvidence(report,{text:text=>[{text:String(text)}],heading:text=>({text})}).map(l=>l.text).join(' ');
 assert.match(text,/Confirmed-refusal timing was not established/);assert.match(text,/observations.*remain usable/);assert.doesNotMatch(text,/0 eligible network requests/);
 assert.match(text,/from saved session anchor/);assert.doesNotMatch(text,/284 ms after click/);
});
