import { EvidenceHeaderStatus } from "./evidence-header-status";
import React from "react";
import type { PrivacyAuditEvidence, ReportReviewFocus } from "@certscore/api-contracts";
import { REVIEW_FOCUS_LABELS } from "../../lib/scans/report-review-focus";
import { californiaPrivacyEvidence, PRIVACY_CONTROL_LABELS as controlLabels, PRIVACY_TOPIC_LABELS as topicLabels } from "../../lib/scans/california-privacy-evidence";
import { EvidenceSectionHeader } from "./evidence-section-header";
import { CALIFORNIA_REVIEW_FAMILY_LABELS,californiaCoverageFamilyLabel, type CaliforniaReviewCoverage, type CaliforniaRightsClauseAssessment, type CaliforniaCollectionNoticeAssessment,type CaliforniaCollectionNoticeV2,type CaliforniaCollectionNoticeV3,type CaliforniaCollectionNoticeV4,type CaliforniaCollectionNoticeV5,type RuntimeStoragePurposeV2,type RuntimeScriptEvidence,type CaliforniaSaleSharingAssessment } from "@certscore/contracts";

type CollectionPoint=(CaliforniaCollectionNoticeAssessment|CaliforniaCollectionNoticeV2|CaliforniaCollectionNoticeV3|CaliforniaCollectionNoticeV4|CaliforniaCollectionNoticeV5)["points"][number];
function CollectionNoticePoint({point}:{point:CollectionPoint}) {
  const technical="assessmentScope" in point && point.assessmentScope === "technical_context";
  const label=technical?point.technicalMatch === "exact_name_retained"?"Product mention retained":point.technicalMatch === "not_assessed"?"Product attribution unresolved":"Product mention not retained":
    point.status === "matched_text"?"Category/purpose text matched":point.status === "policy_text_only"?"Partial wording retained":point.status === "not_matched"?"Wording not located":"Limited";
  return <div className="mt-2"><strong>{point.label}: {label}</strong>
    <p>{point.reason}</p>{"categoryMatch" in point && !technical?<p>Category: {point.categoryMatch.replaceAll("_"," ")} · Purpose: {point.purposeMatch.replaceAll("_"," ")} · Association: {point.association.replaceAll("_"," ")}</p>:
      "purposeMatch" in point && !technical?<p>Purpose: {point.purposeMatch.replaceAll("_"," ")}{point.recipientMatch!=="not_assessed"?` · Recipient: ${point.recipientMatch.replaceAll("_"," ")}`:""}{point.scope === "resource_contact_only"?" · Resource contact only":""}</p>:null}
    {"purposeBasis" in point&&point.purposeBasis === "declared_only"?<p>Purpose evidence: website declaration</p>:null}
    {point.passages.map((passage,index)=><blockquote key={index} className="mt-1 border-l-2 border-zinc-200 pl-2">{passage.excerpt}</blockquote>)}
  </div>;
}

function StoragePurposeItem({item,sources}:{item:RuntimeStoragePurposeV2["items"][number];sources:RuntimeScriptEvidence[]}) {
  const declared=item.declaredPurpose;
  const purpose=item.purpose!=="unknown"?item.purpose:declared&&declared.purpose!=="unknown"?`Declared ${declared.purpose} use`:"Unresolved";
  return <div className="mt-2"><strong>{item.name} · {item.kind}</strong><p>Purpose: {purpose}{item.dataOrigin === "document_referrer"?" · Data source: document.referrer":""}</p>
    <p>{declared&&item.purpose === "unknown"?"Named-cookie purpose wording retained in the website’s declaration.":item.reason}</p>
    {declared?<blockquote className="mt-1 border-l-2 border-zinc-200 pl-2"><strong>Website declaration: </strong>{declared.passage.excerpt}</blockquote>:null}
    {item.readUse?<div className="mt-2"><strong>Storage-read/use trace</strong><p>{item.readUse.reason}</p>
      {item.readUse.reads.map(read=><p key={read.evidenceRef}>{read.context.replaceAll("_"," ")} · {read.count} {read.count===1?"read":"reads"} · {read.valueState === "empty"?"empty value":read.valueState === "nonempty"?"non-empty value; contents omitted":read.valueState} · {read.callerUrl}:{read.line}:{read.column}</p>)}
    </div>:null}
    {sources.filter(source=>source.sourceSha256===item.sourceSha256).flatMap(source=>source.facts.filter(fact=>fact.name===item.name||fact.keySource === "enumerated_storage_key"&&item.readUse?.reads.some(read=>read.sourceSha256===source.sourceSha256&&fact.callsite&&read.line===fact.callsite.line&&read.column>=fact.callsite.column&&read.column<fact.callsite.endColumn)).flatMap(fact=>fact.excerpts)).map((excerpt,index)=><pre key={index} className="mt-1 whitespace-pre-wrap break-all rounded bg-zinc-50 p-2 text-[11px]"><code>{excerpt.text}</code></pre>)}
    <p className="text-zinc-500">{item.basis.replaceAll("_"," ")}{item.sourceSha256?` · Source ${item.sourceSha256.slice(0,12)}`:""}</p>
  </div>;
}

export function CaliforniaCoverageSummary({coverage,rightsAssessment,collectionNoticeAssessment,saleSharingAssessment}:{coverage?:CaliforniaReviewCoverage;
  rightsAssessment?:CaliforniaRightsClauseAssessment;collectionNoticeAssessment?:CaliforniaCollectionNoticeAssessment|CaliforniaCollectionNoticeV2|CaliforniaCollectionNoticeV3|CaliforniaCollectionNoticeV4|CaliforniaCollectionNoticeV5;saleSharingAssessment?:CaliforniaSaleSharingAssessment}) {
  if (!coverage) return null;
  const supported = coverage.families.filter(row=>row.status === "observed" || row.status === "not_triggered_in_scope").length;
  const review = coverage.families.filter(row=>row.status === "review").length;
  const limited = coverage.families.filter(row=>row.status === "unknown").length;
  const gaps=coverage.families.filter(row=>row.status === "assessed_gap").length;
  const completed=coverage.contractVersion === "certscore.california-review-coverage.v4"?coverage.families.filter(row=>row.assessmentState === "completed").length:null;
  const partial=coverage.contractVersion === "certscore.california-review-coverage.v4"?coverage.families.filter(row=>row.assessmentState === "partial").length:0;
  const technicalPoints=(collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v3" || (collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v4" || collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v5"))?collectionNoticeAssessment.points.filter(point=>point.assessmentScope === "technical_context"):[];
  return <details className="mt-2 text-xs leading-5 text-zinc-600" data-california-coverage>
    <summary className="cursor-pointer font-medium">California coverage: {completed!==null?<>{completed} assessed{partial?` · ${partial} partial`:""}{gaps?` · ${gaps} ${gaps===1?"gap":"gaps"}`:""}</>:<>{supported} supported{gaps?` · ${gaps} assessed ${gaps===1?"gap":"gaps"}`:""} · {review} to review</>}{limited ? ` · ${limited} limited` : ""}</summary>
    <p className="mt-2">Assessed against CCPA/CPRA requirements assuming the law applies. Business applicability is undetermined.</p>
    <dl className="mt-2 space-y-2">{coverage.families.map(row=><div key={row.id}>
      <dt className="font-semibold">{CALIFORNIA_REVIEW_FAMILY_LABELS[row.id]} · {californiaCoverageFamilyLabel(row)}</dt>
      <dd>{row.reason}</dd>
    </div>)}</dl>
    {rightsAssessment ? <details className="mt-3" data-california-rights-clauses><summary className="cursor-pointer font-medium">Rights clause assessment</summary>
      <p className="mt-1">General consumer wording is distinguished from California-specific wording. Retention or security text does not establish a consumer deletion right.</p>
      {rightsAssessment.topics.map(topic=><div key={topic.topic} className="mt-2"><strong>{topic.topic.replaceAll("_"," ")}: {topic.status === "disclosed" ? "Rights wording retained" : topic.status === "not_observed" ? "Not observed" : "Needs interpretation"}</strong>
        <p>{topic.reason}</p>{topic.status === "disclosed" ? <p>{topic.context.replaceAll("_"," ")}</p> : null}
        {topic.passages.map((passage,index)=><blockquote key={index} className="mt-1 border-l-2 border-zinc-200 pl-2">{passage.excerpt}</blockquote>)}
        {topic.excludedPassages.length ? <details className="mt-1"><summary className="cursor-pointer">Excluded retention/security wording</summary>{topic.excludedPassages.map((passage,index)=><blockquote key={index} className="mt-1 border-l-2 border-zinc-200 pl-2">{passage.excerpt}</blockquote>)}</details> : null}
      </div>)}
    </details> : null}
    {saleSharingAssessment ? <details className="mt-3" data-california-sale-sharing-clauses><summary className="cursor-pointer font-medium">Sale/sharing clause assessment</summary>
      <p className="mt-1">Policy claims are assessed separately for sale, advertising-related sharing, operational disclosures and analytics. Recipient legal roles and actual practices remain separate.</p>
      {saleSharingAssessment.topics.map(topic=><div key={topic.topic} className="mt-2"><strong>{topic.topic.replaceAll("_"," ")}: {topic.status.replaceAll("_"," ")}</strong>
        <p>{topic.reason}</p>{topic.passages.map((passage,index)=><blockquote key={index} className="mt-1 border-l-2 border-zinc-200 pl-2">{passage.excerpt}</blockquote>)}
      </div>)}
    </details> : null}
    {collectionNoticeAssessment ? <details className="mt-3" data-california-collection-matching><summary className="cursor-pointer font-medium">Collection-notice matching</summary>
      <p className="mt-1">Matches compare observed fields or activity with retained notice text and its association. Notice timing and legal adequacy remain unassessed.</p>
      {collectionNoticeAssessment.points.filter(point=>!("assessmentScope" in point) || point.assessmentScope!=="technical_context").map(point=><CollectionNoticePoint key={point.id} point={point}/>)}
      {(collectionNoticeAssessment.contractVersion === "certscore.california-collection-notice-matching.v4" || collectionNoticeAssessment.contractVersion === "certscore.california-collection-notice-matching.v5")?<details className="mt-3" data-runtime-storage-purposes><summary className="cursor-pointer font-medium">Cookie/storage purpose evidence</summary>
        {collectionNoticeAssessment.runtimePurposeAssessment.items.map(item=><StoragePurposeItem key={`${item.kind}:${item.name}`} item={item} sources={collectionNoticeAssessment.runtimePurposeAssessment.retainedSources}/>)}
      </details>:null}
      {technicalPoints.length?<details className="mt-3" data-california-technical-context><summary className="cursor-pointer font-medium">Technical product lookups · {technicalPoints.length}</summary>
        {technicalPoints.map(point=><CollectionNoticePoint key={point.id} point={point}/>)}</details>:null}
      {!collectionNoticeAssessment.points.length ? <p className="mt-2">No collection points were available for matching in this retained inventory.</p> : null}
    </details> : null}
    {coverage.topics.length ? <details className="mt-2"><summary className="cursor-pointer">Retained policy passages</summary>
      {coverage.topics.map((row,index)=><blockquote className="mt-2 border-l-2 border-zinc-200 pl-2" key={`${row.topic}-${index}`}>
        <strong>{row.topic.replaceAll("_"," ")}</strong>: {row.excerpt}
      </blockquote>)}</details> : null}
  </details>;
}

export function RegulatoryReviewFocus({ focus }: { focus: ReportReviewFocus }) {
  return <form method="get" aria-label="Review focus" className="inline-flex shrink-0 items-center gap-3 border-b border-zinc-200 text-xs">
      {Object.entries(REVIEW_FOCUS_LABELS).map(([value, label]) => <button key={value} name="reviewFocus" value={value} type="submit" aria-pressed={focus === value}
        className={`-mb-px whitespace-nowrap border-b-2 px-0.5 py-1 leading-4 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${focus === value ? "border-sky-700 font-semibold text-sky-900" : "border-transparent font-medium text-zinc-500 hover:text-zinc-900"}`}>{label}</button>)}
    </form>;
}

export function CaliforniaPrivacyWorkpaper({ evidence: retainedEvidence, focus, scanId }: { evidence?: PrivacyAuditEvidence | null; focus: ReportReviewFocus; scanId?: string }) {
  if (focus !== "ccpa_cpra") return null;
  const { evidence, candidates, section } = californiaPrivacyEvidence(retainedEvidence, scanId);
  const topics = evidence ? [...new Set(evidence.notices.flatMap(notice => notice.passages.map(passage => passage.topic)))] : [];
  return <details id="california-privacy-evidence" className="group/privacy-choices border-b border-r border-zinc-200 p-5">
    <EvidenceSectionHeader title={section.title}
      recap={section.recap}
      badge={<EvidenceHeaderStatus rows={section.displayStatus === "Limited" ? [{status: "Limited"}] : section.displayStatus === "Review" ? [{status: "Needs review"}] : []} />} />
    <p className="mt-1 text-xs text-zinc-500">{evidence ? `${evidence.controls.length} observed ${evidence.controls.length === 1 ? "choice" : "choices"}${candidates.length ? ` · ${candidates.length} ${candidates.length === 1 ? "link" : "links"} to review` : ""} · ${evidence.notices.length} ${evidence.notices.length === 1 ? "notice" : "notices"}${topics.length ? ` · ${topics.length} ${topics.length === 1 ? "topic" : "topics"} found` : ""}` : "Evidence unavailable"}</p>
    <div className="mt-4 space-y-4 text-sm text-zinc-700">
      {!evidence ? <p>No verified privacy-choice or notice evidence was retained for this scan. This does not establish that these items are absent.</p> : <>
        <p>{evidence.controls.length ? `${evidence.controls.length} visible, named privacy-choice ${evidence.controls.length === 1 ? "link was" : "links were"} verified on this page.` : "No privacy-choice link was verified in this capture."}{topics.length ? ` Retained notice text covers ${topics.map(topic => topicLabels[topic].toLowerCase()).join(", ")}.` : ""}</p>
        <dl className="space-y-2">{Object.entries(controlLabels).map(([kind, label]) => {
          const rows = evidence.controls.filter(row => row.kind === kind);
          const pending = candidates.filter(row => row.kind === kind);
          return <div key={kind}><dt className="font-semibold">{label}</dt><dd>{rows.map(row => <div key={row.evidenceRef} className="mt-1">
            <span>Observed: “{row.label}” · {row.placement.replaceAll("_", " ")}</span>
            {row.destinationUrl ? <a className="ml-2 break-all text-sky-800 underline" href={row.destinationUrl} target="_blank" rel="noreferrer">View destination</a> : <span> · No separate HTTP destination retained</span>}
            <p className="text-xs text-zinc-500">{row.retrieval === "fetched" ? "Destination page retrieved" : row.retrieval === "not_attempted" ? "Destination page not fetched" : `Destination fetch ${row.retrieval.replaceAll("_", " ")}`} · Evidence: {row.evidenceRef}</p>
          </div>)}{pending.map(row => <div key={row.evidenceRef} className="mt-1 text-zinc-600">
            <span>Link identified: “{row.label}” · {row.verification === "visibility_unverified" ? "visibility not verified" : "accessible name not verified"}.</span>
            <a className="ml-2 break-all text-sky-800 underline" href={row.destinationUrl} target="_blank" rel="noreferrer">Retained destination</a>
            <p className="text-xs text-zinc-500">Visitor-facing choice not confirmed. Evidence: {row.evidenceRef}</p>
          </div>)}{!rows.length && !pending.length ? "No retained evidence; absence was not verified." : null}</dd></div>;
        })}</dl>
        <div><h3 className="font-semibold">Notice topics found</h3>
          {!evidence.notices.length ? <p className="mt-2">No verified, target-owned notice text available in this workpaper.</p> : evidence.notices.map(notice => <div className="mt-3 border-t border-zinc-100 pt-3" key={notice.evidenceRef}>
            <a className="break-all text-sky-800 underline" href={notice.url} target="_blank" rel="noreferrer">{notice.kind.replaceAll("_", " ")}</a>
            <p className="text-xs text-zinc-500">{notice.passages.length} {notice.passages.length === 1 ? "topic" : "topics"} located · {notice.directlyLinkedFromScannedPage ? "Linked from the scanned page" : "Direct link not established"}</p>
            {notice.passages.length ? <><p className="mt-2 text-xs">{notice.passages.map(passage => topicLabels[passage.topic]).join(" · ")}</p>
              <details className="mt-2 text-xs text-zinc-500"><summary className="cursor-pointer">View retained passages</summary>
                {notice.passages.map(passage => <div className="mt-2" key={passage.topic}><p className="font-semibold">{topicLabels[passage.topic]}</p><blockquote className="mt-1 border-l-2 border-zinc-200 pl-3 leading-5">{passage.excerpt}</blockquote></div>)}
              </details></> : null}
            {!notice.passages.length ? <p className="text-xs">No supported topic passage located in the retained excerpt.</p> : null}
          </div>)}
        </div>
        {evidence.truncated ? <p>Display limits apply; this workpaper is not an exhaustive inventory of privacy surfaces.</p> : null}
        <details className="border-t border-zinc-200 pt-3 text-xs text-zinc-500"><summary className="cursor-pointer">Evidence scope</summary><p className="mt-2">This passive scan verifies visible links, retained destinations, and located notice topics. It does not submit opt-out choices or determine whether the notice is complete.</p></details>
        <details className="border-t border-zinc-200 pt-3 text-xs text-zinc-500"><summary className="cursor-pointer">Evidence provenance</summary><p className="mt-2 break-all">Captured {evidence.capturedAt} · Source SHA-256: {evidence.sourceHash}</p></details>
      </>}
    </div>
  </details>;
}
