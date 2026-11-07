import {DOCUMENT_ITEM_CHECKS} from './audit-report-format-checks';
/** Presentation formats of Scan report, never additional canonical evidence views. */
export const REPORT_FORMAT_POLICY={
 version:'certscore.audit-report-formats.v2',parentView:'report',formats:['web','pdf','docx'],
 basis:'Web, PDF and DOCX use the same persisted report generation through separate presentation adapters. Rendered-value checks inspect local PDF bytes and DOCX OOXML; source-reviewed summary boundaries are not value-parity passes. No deployed artifact or universal visual-layout parity is claimed.',
 differences:['Owner-selected source-bound screenshot links appear in PDF/DOCX; reference parity is separate from image-byte integrity. Existing PDF embedded-image behavior is unchanged; DOCX omits image blocks.','DOCX renders charts and timelines as text. PDF and Web retain their own layouts and interactions.','Report focus, retained evidence and export row caps still apply.'],
 sources:['apps/web/server/scans/report-export.ts','apps/web/server/scans/report-export-pdf.ts','apps/web/server/scans/report-export-docx.ts','apps/web/app/api/scans/[scanId]/report-export/route.ts'],
} as const;
const checked:Record<string,{detail:string;test:string}>={
 'collection.forms.observed_count':{detail:'Observed form totals and separate initial/after-Accept counts match the shared document content; unknown later coverage stays unknown.',test:'apps/web/server/scans/report-forms-parity.test.ts'},
 'tracking.requests.inventory_cap':{detail:'Missing/incomplete request inventories remain unavailable; bounded tables retain total and omitted-resource counts.',test:'apps/web/server/scans/report-inventory-parity.test.ts'},
};
const visualIds=new Set(['consent.visual.banner_ref','consent.visual.reject_ref','consent.visual.prominence_ref','collection.snapshot.reference']);
export function reportFormatsFor(id:string,representation:string){
 const fixture=checked[id],documentCheck=DOCUMENT_ITEM_CHECKS[id],omitted=representation==='omitted';
 const boundary=documentBoundary(id);
 const cell=(format:'web'|'pdf'|'docx')=>({
  status:omitted?'outside_report_scope':format!=='web'&&documentCheck?documentCheck.status:format!=='web'&&boundary?'source_reviewed_boundary':fixture?'shared_content_checked':format==='web'?'mapped':'not_item_verified',
  label:omitted?'Outside report scope':format!=='web'&&documentCheck?(documentCheck.status==='rendered_value_checked'?'Rendered value checked':'Rendered summary checked'):format!=='web'&&boundary?'Scope reviewed · value parity unverified':fixture?'Shared content checked':format==='web'?'Web mapping registered':'Not item-verified',
  detail:omitted?'This catalog item is outside the registered scan-report scope; shared renderer use does not add it.':format!=='web'&&documentCheck?documentCheck.detail:format!=='web'&&boundary?boundary:fixture?.detail??(format==='web'?'Uses the existing report mapping and retained-value status below.':'Shared report source alone does not establish this item’s exported content or parity.'),
  formatDifference:format==='docx'&&visualIds.has(id)&&id!=='collection.snapshot.reference'?'Image blocks are intentionally omitted; this item is represented by a generation- and image-hash-bound reference link.':null,
  checks:format!=='web'&&documentCheck?[documentCheck.test]:fixture?[fixture.test]:[],artifactVerification:format!=='web'&&documentCheck?'local_fixture_bytes':'not_performed',layoutVerification:'not_performed',
 });
 return {web:cell('web'),pdf:cell('pdf'),docx:cell('docx')};
}

/** Source-reviewed output boundaries, never treated as rendered-value checks. */
function documentBoundary(id:string):string|undefined{
 if(id==='page.industry')return 'Industry is optional benchmark/context metadata, not core observed evidence. The document omits this standalone taxonomy item; keep the accepted metadata boundary unless a specific reader use is identified.';
 if(id.startsWith('operations.'))return 'Audit cohort inventories, exclusions, original-creator proof and daily completeness are outside document report scope. Per-scan report status or a workpaper link cannot substitute for these audit values.';
 if(id.startsWith('policies.passage.'))return 'PDF/DOCX intentionally use shortened policy excerpts and selected source URLs. Full passages, original receipt/hash/timing detail remain in evidence JSON. Keep the accepted concise-report boundary; do not mark exact passage parity.';
 if(id.startsWith('policies.'))return 'Documents retain selected disclosure statuses and condensed evidence. The separate canonical evidence-state/verdict and producer/local-verification records are not losslessly serialized. Scope review: report-pdf-appendices.ts/pdfPolicyEvidenceLines.';
 if(id.startsWith('tracking.'))return 'Documents contain bounded cookie/storage, service and request-resource tables, with distinct units and row limits. Complete event identities, graphs and the canonical evidence-state/verdict pair remain separate JSON/audit records. Scope review: report-export-pdf.ts and report-pdf-appendices.ts.';
 if(id.startsWith('privacy.'))return 'California-focused documents contain selected rights/notice/choice clauses and observations. They do not serialize every typed assessment or all dispatch/submission/registration/effectiveness stages. Detailed producer records remain in JSON; no equivalent action result is inferred.';
 if(id.startsWith('transport.'))return 'The five transport assessments appear in document summaries/details; display status is not the lossless canonical evidence-state/verdict pair. Existing report-inventory-parity tests cover all five labels, not per-item typed equivalence.';
 if(id.startsWith('consent.')&&!id.includes('.visual.'))return 'The concise document uses control labels, CMP rows and bounded choice summaries. A display phrase cannot replace raw inspection state, returned verdict, capture reason or independently bound measurement. Keep detailed JSON and audit contracts separate.';
 if(id==='collection.form.evidence_refs')return 'Form source reference arrays are retained in evidence JSON; document form labels and snapshot hyperlinks are not those original provenance references.';
 if(id.startsWith('collection.destination.'))return 'Document form-event/destination tables contain selected passive events and requests. Complete trace availability and canonical event counts are not inferred from the displayed subset.';
 if(id.startsWith('gpc.'))return 'GPC request/collection/identifier samples, qualification roles, processing declarations, recipients and caps remain detailed JSON evidence. Document narratives are not a lossless serialization. Keep the separate windows and qualification versions; expanding these tables needs a deliberate document-detail decision.';
 if(id==='accessibility.examples.coverage')return 'Documents show bounded examples and summary counts. The complete example-coverage object, per-rule omissions and frame coverage are not a lossless document field.';
 if(id.startsWith('integrity.'))return 'Documents show eligible finding narratives and bounded link/code evidence, not the full source-bound finding/link object or an exact inspection-total ledger. See report-pdf-site-integrity.ts; do not equate displayed link rows with all inspected links.';
 if(id.startsWith('technology.'))return 'Documents include technology tables and selected advisory text. Exact advisory records and original provenance fields remain in JSON; displayed records and overview totals need their own per-item assertions before numeric parity is claimed.';
 return undefined;
}
