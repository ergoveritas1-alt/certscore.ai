import type { PublicOptOutSurfaces } from "../../lib/scans/public-first-layer-consent-evidence";
import { signalSnapshotValueClass } from "./signal-snapshot-styles";
import { FindingDisclosureSummary } from "./finding-disclosure-summary";
import type { CaliforniaChoicePresence, CaliforniaPolicyChoiceMethods, CaliforniaFrictionlessGpcException, CaliforniaOptOutPresence } from "../../lib/scans/california-choice-presence";
import { EvidenceJumpLink } from "./evidence-jump-link";
import { DisclosureChevron } from "./report-finding-row";
import { EvidenceStatusBadge } from "./evidence-status-badge";
import { CaliforniaReviewCoverage as CaliforniaChoiceInspection } from "./california-review-coverage";
import { californiaPrivacyReviewSchema, type CaliforniaPrivacyReview } from "@certscore/contracts";
import { EvidenceHeaderStatus } from "./evidence-header-status";
import React from "react";
import type { PrivacyAuditEvidence, ReportReviewFocus } from "@certscore/api-contracts";
import { REVIEW_FOCUS_LABELS } from "../../lib/scans/report-review-focus";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";
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

type CaliforniaCoverageProps = {coverage?:CaliforniaReviewCoverage;
  rightsAssessment?:CaliforniaRightsClauseAssessment;collectionNoticeAssessment?:CaliforniaCollectionNoticeAssessment|CaliforniaCollectionNoticeV2|CaliforniaCollectionNoticeV3|CaliforniaCollectionNoticeV4|CaliforniaCollectionNoticeV5;saleSharingAssessment?:CaliforniaSaleSharingAssessment};

function californiaCoverageLabel(coverage: CaliforniaReviewCoverage) {
  const supported = coverage.families.filter(row=>row.status === "observed" || row.status === "not_triggered_in_scope").length;
  const review = coverage.families.filter(row=>row.status === "review").length;
  const limited = coverage.families.filter(row=>row.status === "unknown").length;
  const gaps = coverage.families.filter(row=>row.status === "assessed_gap").length;
  if (coverage.contractVersion === "certscore.california-review-coverage.v4") {
    const completed = coverage.families.filter(row=>row.assessmentState === "completed").length;
    const partial = coverage.families.filter(row=>row.assessmentState === "partial").length;
    return `${completed} assessed${partial ? ` · ${partial} partial` : ""}${gaps ? ` · ${gaps} ${gaps === 1 ? "gap" : "gaps"}` : ""}${limited ? ` · ${limited} limited` : ""}`;
  }
  return `${supported} supported${gaps ? ` · ${gaps} assessed ${gaps === 1 ? "gap" : "gaps"}` : ""} · ${review} to review${limited ? ` · ${limited} limited` : ""}`;
}

export function CaliforniaCoverageSummary({coverage, choicePresence, policyChoiceMethods, frictionlessGpcException, optOutPresence, optOutSurfaces}: Pick<CaliforniaCoverageProps, "coverage"> & {choicePresence?: CaliforniaChoicePresence | null; policyChoiceMethods?: CaliforniaPolicyChoiceMethods | null; frictionlessGpcException?: CaliforniaFrictionlessGpcException | null; optOutPresence?: CaliforniaOptOutPresence; optOutSurfaces?: PublicOptOutSurfaces}) {
  const observedEntrance = Boolean(optOutSurfaces?.bannerControls.length || optOutSurfaces?.footerLinks.length ||
    optOutSurfaces?.siteNavigationControls?.length);
  const optOutState = optOutPresence?.state ?? choicePresence?.state ?? "unknown";
  const optOutLabel=optOutState === "observed" ? "Observed" : optOutState === "not_observed" ? "Not observed" : "Unknown";
  const optOutSummary=<><span className="min-w-0 flex-1 font-medium text-zinc-900">Sale/sharing opt-out</span><span className="shrink-0" data-opt-out-status={optOutState}><EvidenceStatusBadge label={optOutLabel} tone={optOutState === "observed" ? "positive" : optOutState === "not_observed" ? "neutral" : "context"} /></span></>;
  const exceptionReason = !frictionlessGpcException ? "" : frictionlessGpcException.assessment.basis === "qualifying_collection_under_gpc"
    ? "Advertising collection observed under GPC." : frictionlessGpcException.assessment.basis === "required_signal_disclosures_missing"
    ? "Required signal disclosure absent from the complete policy assessment." : "GPC handling and full scope unverified.";
  const assessed = !coverage ? null : coverage.contractVersion === "certscore.california-review-coverage.v4"
    ? coverage.families.filter(row=>row.assessmentState === "completed").length
    : coverage.families.filter(row=>row.status === "observed" || row.status === "not_triggered_in_scope").length;
  return <details className="group/signal border-b border-zinc-200 py-2" data-california-coverage>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs leading-4 [&::-webkit-details-marker]:hidden">
      <span className="text-xs font-medium text-zinc-500">California coverage</span>
      <span className={signalSnapshotValueClass}>{coverage ? `${assessed} ${coverage.contractVersion === "certscore.california-review-coverage.v4" ? "assessed" : "supported"}` : optOutLabel}<DisclosureChevron className="text-zinc-400 group-open/signal:rotate-180" /></span>
    </summary>
    <div className="mt-3 space-y-2 text-xs leading-5 text-zinc-600">
      <div className="border-b border-zinc-200 pb-1" data-california-opt-out-presence>
        {optOutPresence?.signal || optOutPresence?.absenceScope || choicePresence?.labels.length || frictionlessGpcException || policyChoiceMethods?.methods.length ? <details className="group/opt-out-evidence" data-opt-out-evidence>
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">{optOutSummary}<span aria-hidden="true" className="inline-flex h-7 w-8 shrink-0 items-center justify-center rounded border border-zinc-200 bg-white text-base font-semibold text-sky-800">…</span><span className="sr-only group-open/opt-out-evidence:hidden">Show opt-out assessment details</span><span className="sr-only hidden group-open/opt-out-evidence:inline">Hide opt-out assessment details</span></summary>
          <div className="space-y-1 pt-2 text-xs">
            {optOutPresence?.absenceScope?<><p>Scope: {optOutPresence.absenceScope}</p><p>{observedEntrance ? "No qualifying opt-out signal was found within this search scope." : "No qualifying opt-out signal was found in the captured evidence."}</p></>:null}
            {optOutPresence?.absenceLimitations?.map(limit=><p key={limit}>{limit}</p>)}
            {optOutPresence?.absenceSourceUrl?<a className="break-all text-sky-800 underline underline-offset-2" href={optOutPresence.absenceSourceUrl} target="_blank" rel="noreferrer">Source page ↗</a>:null}
            {choicePresence?.labels.map(label=><p key={label}>“{label}”</p>)}
            {optOutPresence?.signal ? <>
              {optOutPresence.signal.scopeLabel?<p className="font-medium text-zinc-800">Scope: {optOutPresence.signal.scopeLabel}</p>:null}
              {optOutPresence.signal.evidenceLimitations?.map(limit=><p key={limit}>{{instruction_destination_unverified:'Instruction link destination was not retained.',template_wording_retained:'Policy contains template wording.'}[limit]}</p>)}
              {optOutPresence.signal.sourceQualityPassage?<blockquote className="border-l-2 border-sky-200 pl-2">Template text retained: {optOutPresence.signal.sourceQualityPassage.excerpt}</blockquote>:null}
              {optOutPresence.signal.contextPassage?<blockquote className="border-l-2 border-sky-200 pl-2">{optOutPresence.signal.contextPassage.excerpt}</blockquote>:null}
              <blockquote className="border-l-2 border-sky-200 pl-2">{optOutPresence.signal.passage.excerpt}</blockquote><a className="break-all text-sky-800 underline underline-offset-2" href={optOutPresence.signal.sourceDocumentUrl} target="_blank" rel="noreferrer">{optOutPresence.signal.basis==="visible_dom_opt_out_label"||optOutPresence.signal.scope==="localized_page"?`Source page: ${optOutPresence.signal.sourceDocumentUrl} ↗`:"Source policy ↗"}</a></> : null}
            {policyChoiceMethods?.methods.length ? <section className="mt-3 border-t border-zinc-200 pt-3" data-policy-choice-methods>
              <h3 className="text-xs font-medium text-zinc-600">Methods listed in policy · {policyChoiceMethods.methods.length}</h3>
              <div className="space-y-2 py-2">
                <p>Listed in a linked privacy policy. Homepage availability, sale/sharing scope and effectiveness are not established.</p>
                {policyChoiceMethods.methods.map(method=><div key={method.evidenceRef} className="border-t border-zinc-200 pt-2">
                  <p className="font-medium text-zinc-900">“{method.label}” · {method.method === "email" ? "Email link" : "Web link"}</p>
                  <p className="break-all">{method.destination}</p>
                  <a href={method.sourceDocumentUrl} target="_blank" rel="noreferrer" className="break-all text-sky-800 underline underline-offset-2">Source policy ↗</a>
                </div>)}
              </div>
            </section> : null}
            {frictionlessGpcException ? <section className="mt-3 border-t border-zinc-200 pt-3" data-frictionless-gpc-exception>
              <h3 className="text-xs font-medium text-zinc-600">Frictionless GPC exception</h3>
              <div className="mt-1" data-frictionless-evidence>
                <p><strong className="font-medium text-zinc-800">{frictionlessGpcException.assessment.status === "unresolved" ? "Unresolved" : "Conflicting evidence"}</strong><span className="ml-1.5">· {exceptionReason}</span></p>
                <div className="mt-2 space-y-2">
                  <table className="w-full text-left text-xs"><caption className="sr-only">Frictionless GPC policy declarations</caption>
                    <thead><tr><th scope="col" className="py-1">Policy disclosure</th><th scope="col">Evidence</th></tr></thead>
                    <tbody>{frictionlessGpcException.assessment.disclosures.map(row=><tr key={row.id} className="border-t border-zinc-200">
                      <td className="py-1 pr-2">{{opt_out_right:"Opt-out right described in policy",frictionless_processing:"Frictionless processing statement",signal_setup:"Instructions to enable the signal",other_request_methods:"Other request instructions"}[row.id]}</td>
                      <td>{row.status === "declared" ? "Declared" : "Unresolved"}</td>
                    </tr>)}</tbody>
                  </table>
                  {frictionlessGpcException.assessment.disclosures.flatMap(row=>row.passage?[<blockquote key={row.id} className="border-l-2 border-sky-200 pl-2">{row.passage.excerpt}</blockquote>]:[])}
                  <p>Remaining checks: signal processing, fees, equivalent experience, signal-triggered interruptions and full sale/sharing scope.</p>
                  {frictionlessGpcException.sources.map(source=><a key={source.evidenceRef} href={source.url} target="_blank" rel="noreferrer" className="mr-3 text-sky-800 underline underline-offset-2">Source policy ↗</a>)}
                </div>
              </div>
            </section> : null}
          </div>
        </details> : <div className="flex items-center justify-between gap-3">{optOutSummary}</div>}
      </div>
      {observedEntrance || optOutSurfaces?.footerInspection || optOutSurfaces?.sameVisitFooter || optOutSurfaces?.bannerTimingLimitation || Boolean(optOutSurfaces?.vendorRefusals.length) ? <details data-captured-privacy-controls>
        <summary className="cursor-pointer font-medium text-zinc-800">Captured website controls</summary>
        <div className="mt-2 space-y-2">
            {optOutSurfaces?.bannerControls.length ? <section><h3 className="font-medium text-zinc-800">Banner controls</h3>
              {optOutSurfaces.bannerControls.map(row => <p key={row.evidenceRef}>“{row.label}”{row.settingsEntranceSource === "same_banner_notice" ? " · Banner instructions identify this button as opening privacy settings" : row.opensPreferenceCenter ? " · Labeled to open privacy settings" : ""}</p>)}</section> : null}
            {optOutSurfaces?.siteNavigationControls?.length ? <section><h3 className="font-medium text-zinc-800">Site navigation controls</h3>
              {optOutSurfaces.siteNavigationControls.map(row => <p key={row.evidenceRef}>“{row.label}”</p>)}</section> : null}
            {optOutSurfaces?.bannerTimingLimitation ? <p>Banner timing limited the first-layer inspection.</p> : null}
            {optOutSurfaces?.sameVisitFooter ? <p>Starting-page footer inspection · {optOutSurfaces.sameVisitFooter.coverage === "complete"
              ? "Completed within the inspected footer regions" : optOutSurfaces.sameVisitFooter.coverage === "limited"
              ? "Partial coverage" : "No verified starting-page footer capture"}</p> : null}
            {optOutSurfaces?.sameVisitFooterCapture && <FooterCaptureDetail status={optOutSurfaces.sameVisitFooterCapture}/>}
            {optOutSurfaces?.footerInspection ? <p>{optOutSurfaces.sameVisitFooter ? "Separate policy scan" : "Footer link inspection"} · {optOutSurfaces.footerInspection.status === "complete"
              ? "Completed for rendered named controls" : optOutSurfaces.footerInspection.status === "limited"
              ? "Partial coverage" : optOutSurfaces.footerInspection.status === "unavailable" && optOutSurfaces.footerInspection.reason === "no_policy_run"
              ? "Policy scan did not run" : "No verified inspection for this page"}</p> : null}
            {optOutSurfaces?.footerLinks.length ? <section><h3 className="font-medium text-zinc-800">Footer links</h3>
              {optOutSurfaces.footerLinks.map(row => <p key={row.evidenceRef}>“{row.label}”{row.placement ? " · End-of-page strip" : ""}{row.choiceScope === "ads_privacy" ? " · Ads privacy choices" : ""}{row.destinationKind === "privacy_policy" ? " · Links to a privacy policy" : ""}{row.visibility === "rendered_exposed"
                ? " · Reached by the pointer hit test" : row.visibility === "covered"
                ? " · Covered at the sampled points" : optOutSurfaces.sameVisitFooter ? " · Observed on the policy scan" : ""}</p>)}</section> : null}
            {optOutSurfaces?.sameVisitFooter?.otherControls.length ? <section><h3 className="font-medium text-zinc-800">Other footer observations</h3>
              {optOutSurfaces.sameVisitFooter.otherControls.map(row => <p key={row.evidenceRef}>“{row.label}” · {row.visibility === "hidden"
                ? "Hidden at capture" : row.visibility === "offscreen_unverified" ? "Outside the inspected viewport" : "Visibility unverified"}</p>)}</section> : null}
            {optOutSurfaces?.vendorRefusals.length ? <section><h3 className="font-medium text-zinc-800">Vendor-specific refusals</h3>
              {optOutSurfaces.vendorRefusals.map(row => <p key={row.evidenceRef}>“{row.label}”</p>)}</section> : null}
            {observedEntrance ? <p>Opt-out submission and effectiveness were not verified from these controls.</p> : null}
        </div>
      </details> : null}
      {coverage ? <p>{californiaCoverageLabel(coverage)}</p> : null}
      <EvidenceJumpLink targetId="california-privacy-evidence" className="inline-block text-xs">View California privacy review ↓</EvidenceJumpLink>
    </div>
  </details>;
}

export function CaliforniaCoverageDetails({coverage,rightsAssessment,collectionNoticeAssessment,saleSharingAssessment}: CaliforniaCoverageProps) {
  if (!coverage) return null;
  const technicalPoints=(collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v3" || (collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v4" || collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v5"))?collectionNoticeAssessment.points.filter(point=>point.assessmentScope === "technical_context"):[];
  return <section className="text-xs leading-5 text-zinc-600" data-california-assessment-coverage>
    <h3 className="font-semibold text-sm text-zinc-800">Assessment coverage</h3>
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
  </section>;
}

export function RegulatoryReviewFocus({ focus, scores }: {
  focus: ReportReviewFocus;
  scores?: Partial<Record<ReportReviewFocus, number | null>>;
}) {
  return <form method="get" aria-label="Review focus" className="inline-flex max-w-full flex-wrap items-center gap-x-3 border-b border-zinc-200 text-xs">
    {(Object.keys(REVIEW_FOCUS_LABELS) as ReportReviewFocus[]).map(value => {
      const active = focus === value;
      const score = scores?.[value];
      return <button key={value} name="reviewFocus" value={value} type="submit" aria-pressed={active}
        className={`-mb-px inline-flex h-8 items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 leading-4 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 ${active ? "border-sky-700 font-semibold text-sky-900" : "border-transparent font-medium text-zinc-500 hover:text-zinc-900"}`}>
        {REVIEW_FOCUS_LABELS[value]}
        {!active && score != null && Number.isFinite(score) && score >= 0 && score <= 100 ? <>
          <span aria-hidden="true" title={`${score}/100`} data-posture-preview-score
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-[2px]"
            style={{ background: `conic-gradient(${getGdprEprivacyPostureTone(score).ringColor} ${score}%, #e4e4e7 ${score}%)` }}>
            <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-white text-[10px] font-semibold leading-none tabular-nums text-zinc-700">{score}</span>
          </span>
          <span className="sr-only"> score {score} out of 100</span>
        </> : null}
      </button>;
    })}
  </form>;
}

export function CaliforniaPrivacyWorkpaper({ evidence: retainedEvidence, focus, scanId, assessment, gpcAvailable = false, homepage = false, ...coverageProps }: CaliforniaCoverageProps & {
  evidence?: PrivacyAuditEvidence | null; focus: ReportReviewFocus; scanId?: string;
  assessment?: CaliforniaPrivacyReview | null; gpcAvailable?: boolean; homepage?: boolean;
}) {
  if (focus !== "ccpa_cpra") return null;
  const { evidence, candidates, section } = californiaPrivacyEvidence(retainedEvidence, scanId);
  const parsedAssessment = californiaPrivacyReviewSchema.safeParse(assessment);
  const registration = parsedAssessment.success && parsedAssessment.data.contractVersion === "certscore.california-privacy-review.v10" &&
    (!scanId || parsedAssessment.data.scanId === scanId) ? parsedAssessment.data.agentRegistrationAssessment : undefined;
  const topics = evidence ? [...new Set(evidence.notices.flatMap(notice => notice.passages.map(passage => passage.topic)))] : [];
  const rightsLabels = { right_to_know: "Access", right_to_delete: "Deletion", right_to_correct: "Correction", non_discrimination: "Non-discrimination" } as const;
  const rights = coverageProps.rightsAssessment?.topics.filter(topic => topic.status === "disclosed" && topic.passages.length)
    .map(topic => rightsLabels[topic.topic]) ?? [];
  const choices = [...new Set(evidence?.controls.map(control => control.label) ?? [])];
  return <details id="california-privacy-evidence" className="group/privacy-choices border-b border-r border-zinc-200 p-5">
    <EvidenceSectionHeader title={section.title}
      recap={section.recap}
      badge={<EvidenceHeaderStatus rows={section.displayStatus === "Limited" ? [{status: "Limited"}] : section.displayStatus === "Review" ? [{status: "Needs review"}] : []} />} />
    <div className="mt-4 space-y-3 text-sm text-zinc-700">
      <dl className="space-y-2 text-xs leading-5" data-california-review-summary>
        {choices.length ? <div><dt className="font-semibold text-zinc-800">Choices found</dt><dd>{choices.join(" · ")}</dd></div> : null}
        {topics.length ? <div><dt className="font-semibold text-zinc-800">Disclosures captured</dt><dd>{topics.map(topic => topicLabels[topic]).join(" · ")}</dd></div> : null}
        {rights.length ? <div><dt className="font-semibold text-zinc-800">Rights wording found</dt><dd>{rights.join(" · ")}</dd></div> : null}
      </dl>
      {!choices.length && !topics.length && !rights.length ? <p className="text-xs text-zinc-600">{evidence ? "Capture details are available below." : "No verified evidence retained for this visit."}</p> : null}
      {gpcAvailable ? <p className="text-xs"><EvidenceJumpLink targetId="gpc-evidence" className="text-sky-800 underline">View GPC evidence ↓</EvidenceJumpLink></p> : null}
      <details className="border-t border-zinc-200 pt-3 text-xs" data-california-review-details>
        <summary className="cursor-pointer font-medium text-zinc-600">Evidence &amp; assessment details</summary>
        <div className="mt-4 space-y-6">
          <CaliforniaCoverageDetails {...coverageProps} />
          {registration ? <section data-california-agent-registration>
            <h3 className="font-semibold">Authorized-agent registration requirement</h3>
            <blockquote className="mt-2 border-l-2 border-zinc-200 pl-3">{registration.excerpt}</blockquote>
            <p className="mt-2 text-xs">Review the stated registration condition and available authorization routes for individuals acting as agents.</p>
            <a className="mt-1 inline-block break-all text-sky-800 underline" href={registration.sourceDocumentUrl} target="_blank" rel="noreferrer">Retained policy source</a>
            <p className="text-xs text-zinc-500">Evidence: {registration.evidenceRef}</p>
          </section> : null}
          <CaliforniaChoiceInspection assessment={assessment && (!scanId || assessment.scanId === scanId) ? assessment : undefined} homepage={homepage} />
          {!evidence ? <p>No verified privacy-choice or notice evidence was retained for this scan. This does not establish that these items are absent.</p> : <>
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
      </details>
    </div>
  </details>;
}

function FooterCaptureDetail({status}: {status: NonNullable<import("../../lib/scans/public-first-layer-consent-evidence").PublicOptOutSurfaces["sameVisitFooterCapture"]>}) {
  const descriptions: Partial<Record<typeof status.reason,string>> = {
    no_budget:"The capture budget ended before the footer read.",timed_out:"The footer read timed out.",
    aborted:"The scan stopped before the footer read completed.",page_closed:"The page closed before the footer read completed.",
    source_unavailable:"The scanner could not verify the original page identity.",document_mismatch:"The footer and report evidence refer to different documents.",
    read_failed:"The browser could not complete the footer read.",invalid_packet:"The retained footer evidence could not be verified.",
    lane_stopped:"The consent scan stopped before the footer checkpoint.",not_retained:"The scan retained no footer checkpoint.",
    primary_snapshot_missing:"The original page snapshot was unavailable.",primary_snapshot_ambiguous:"Several snapshots claimed to be the original page.",
  };
  return <>{descriptions[status.reason] && <p>{descriptions[status.reason]}</p>}
    {status.unsupportedControlName && <p>A privacy-related footer control had an unverified purpose.</p>}
    {status.unverifiedGeometry && <p>Visibility or pointer access remained unverified for a named footer control.</p>}</>;
}
