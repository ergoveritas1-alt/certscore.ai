import { EvidenceHeaderStatus } from "./evidence-header-status";
import React, { type ReactNode } from "react";
import { TECHNOLOGY_NAMES, TECHNOLOGY_CATEGORY_LABELS, TECHNOLOGY_SCOPE_LABELS, type CmsSecurityProjection, type CmsSignal } from "@certscore/contracts";
import { DetailedEvidenceFinding } from "./detailed-evidence-finding";
import { EvidenceTools } from "./report-finding-row";
import { EvidenceSectionHeader } from "./evidence-section-header";
import { EVIDENCE_SECTION_TITLES, CMS_CORRECTION_STEPS, cmsAdvisoryDisplayCopy, technologyEvidenceRecap, cmsEvidenceVersionLabel } from "../../lib/scans/detailed-evidence-presentation";

const sourceLabels = { meta_generator: "Page metadata", asset_path: "Page asset", html_generator_comment: "Generator comment", core_asset_version: "Core asset version", feed_generator: "Linked feed generator" };
const unknownVersion = <span aria-label="Version not detected">—</span>;

function CmsSources({ signals }: { signals: CmsSignal[] }) {
  return <ul className="space-y-2">{signals.map(signal => <li key={signal.evidenceRef} className="break-words">
    <span className="font-medium">{sourceLabels[signal.kind]}: </span><span className="break-all">{signal.value}</span>
    <a className="mt-1 block break-all text-sky-700 underline" href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">{signal.sourceUrl}</a>
    <span className="mt-1 block break-all text-zinc-400">Source: {signal.artifactRef}</span>
  </li>)}</ul>;
}

function StackRow({ id, name, category, version, scope, confidence, evidence, children }: {
  id: string; name: string; category: string; version: ReactNode; scope: string; confidence: ReactNode; evidence: ReactNode; children?: ReactNode;
}) {
  return <tbody className="border-b border-zinc-200 last:border-0 [&:has(>tr>td>details[open])>.tech-stack-evidence]:table-row">
    <tr id={id} className="align-top">
      <th scope="row" className="px-2 py-2 text-left font-semibold text-zinc-900"><span className="break-words">{name}</span><span className="block text-xs font-normal text-zinc-500">{category}</span></th>
      <td className="px-2 py-2 text-xs tabular-nums text-zinc-700">{version}</td>
      <td className="px-2 py-2 text-xs text-zinc-600">{scope}</td>
      <td className="px-2 py-2 text-xs text-zinc-600">{confidence}</td>
      <td className="py-1 pr-1 text-right">
        <details className="relative text-xs text-zinc-600">
          <summary className="ml-auto flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded font-semibold hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden"
            aria-label={`Supporting evidence for ${name}`} aria-controls={`${id}-evidence`} title={`Supporting evidence for ${name}`}>...</summary>
          <span className="sr-only">Supporting evidence is shown below this row.</span>
        </details>
      </td>
    </tr>
    <tr id={`${id}-evidence`} className="tech-stack-evidence hidden"><td colSpan={5} className="px-2 pb-2">
      <div className="space-y-2 rounded bg-zinc-50 p-3 text-xs text-zinc-600">{evidence}</div>
    </td></tr>
    {children ? <tr><td colSpan={5} className="px-2 pb-2"><div className="space-y-2">{children}</div></td></tr> : null}
  </tbody>;
}

/** The assessment is persisted upstream; this view neither detects nor promotes findings. */
export function CmsSecurityEvidence({ projection }: { projection?: CmsSecurityProjection | null }) {
  if (!projection || !projection.assessment.detections.length && !projection.pluginInventory?.detections.length && !projection.technologyInventory?.detections.length) return null;
  const { assessment } = projection;
  const plugins = projection.pluginInventory?.detections ?? [];
  const inventory = projection.technologyInventory;
  const technologies = [...(inventory?.detections ?? [])].sort((a, b) => Number(a.confidence === "tentative") - Number(b.confidence === "tentative"));
  const flagged = assessment.matches.length > 0;
  return <details id="cms-security-evidence" className="group/cms-security border-b border-r border-zinc-200 bg-white p-5">
    <EvidenceSectionHeader title={EVIDENCE_SECTION_TITLES.cms} recap={technologyEvidenceRecap(projection)}
      badge={<EvidenceHeaderStatus rows={flagged ? [{ status: "Warning" }] : []} />} />
    <div className="mt-3 space-y-4 border-t border-zinc-200 pt-3 text-sm">
      <div className="relative overflow-x-auto" role="region" aria-label="Observed technology table" tabIndex={0}>
        <table className="w-full min-w-[540px] table-fixed border-collapse text-left">
          <caption className="sr-only">Observed CMS, technologies and plugins with versions, scope, confidence and supporting evidence</caption>
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500"><tr>
            <th scope="col" className="w-[28%] px-2 py-2 font-medium">Technology</th>
            <th scope="col" className="w-[23%] px-2 py-2 font-medium">Version</th>
            <th scope="col" className="w-[27%] px-2 py-2 font-medium">Scope</th>
            <th scope="col" className="w-[16%] px-2 py-2 font-medium">Confidence</th>
            <th scope="col" className="w-[6%]"><span className="sr-only">Evidence</span></th>
          </tr></thead>
          {assessment.detections.map(detection => {
            const matches = assessment.matches.filter(match => match.detectionRef === detection.evidenceRef);
            const versionLabel = cmsEvidenceVersionLabel(detection);
            return <StackRow key={detection.evidenceRef} id={detection.evidenceRef} name={detection.name} category="CMS / commerce"
              version={versionLabel === "Version not detected" ? unknownVersion : versionLabel}
              scope={detection.confidence === "high" ? "Page declaration" : "Page assets"}
              confidence={detection.confidence === "high" ? "High" : "Tentative"}
              evidence={<><CmsSources signals={projection.signals.filter(signal => detection.evidenceRefs.includes(signal.evidenceRef))} />
                {!matches.length && (detection.version || detection.informationalOnly) ? <p>{detection.informationalOnly ? "Hosted service; version checks do not apply." : "No issue matched in the selected version checks."}</p> : null}</>}>
              {matches.length ? matches.map(match => <DetailedEvidenceFinding key={match.evidenceRef} id={match.evidenceRef}
                {...cmsAdvisoryDisplayCopy(detection.name, versionLabel, match.record.kind)} badge={<EvidenceHeaderStatus rows={[{ status: "Warning" }]} />}
                evidenceJson={{ detection, match, catalogueVersion: assessment.catalogueVersion, sourceHash: projection.sourceHash }} correctionSteps={CMS_CORRECTION_STEPS}>
                <p className="text-xs font-medium text-zinc-800">{match.record.title}</p>
                {match.record.fixedVersions?.length ? <p className="mt-1 text-xs text-zinc-700">Vendor fixes: {match.record.fixedVersions.join(", ")}</p> : null}
                <a href={match.record.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium text-sky-800 underline">View vendor source</a>
              </DetailedEvidenceFinding>) : null}
            </StackRow>;
          })}
          {technologies.map(row => <StackRow key={`${row.id}:${row.scope}`} id={`technology-${row.id}-${row.scope}`} name={TECHNOLOGY_NAMES[row.id]}
            category={TECHNOLOGY_CATEGORY_LABELS[row.category]} version={row.version ? `${row.version} · Declared` : row.versionStatus === "conflicting" ? "Conflicting versions" : unknownVersion}
            scope={TECHNOLOGY_SCOPE_LABELS[row.scope]} confidence={row.confidence === "high" ? "High" : "Tentative"}
            evidence={<><ul className="space-y-2">{inventory!.signals.filter(signal => row.evidenceRefs.includes(signal.evidenceRef)).map(signal => <li id={signal.evidenceRef} key={signal.evidenceRef} className="break-words">
              <span className="font-medium">{signal.kind === "header" ? "Response header" : signal.kind === "generator" ? "Page metadata" : signal.kind === "marker" ? "DOM marker" : "Page asset"}: </span>{signal.value}
              <a className="mt-1 block break-all text-sky-700 underline" href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">{signal.sourceUrl}</a>
              <span className="mt-1 block break-all text-zinc-400">Source: {signal.sourceRef}</span>
            </li>)}</ul>
              {row.versionStatus === "conflicting" ? <p>Declared versions: {row.observedVersions.join(", ")}</p> : null}
              <p className="break-words text-zinc-400">Rules: {row.ruleIds.join(", ")}</p></>} />)}
          {plugins.map(plugin => <StackRow key={plugin.evidenceRef} id={plugin.evidenceRef} name={plugin.name} category="Plugin"
            version={plugin.version ? `${plugin.version} · Declared` : plugin.versionStatus === "conflicting" ? "Conflicting versions" : unknownVersion}
            scope="Page component" confidence={<span aria-label="Confidence not assessed">—</span>}
            evidence={<><CmsSources signals={projection.signals.filter(signal => plugin.evidenceRefs.includes(signal.evidenceRef))} />
              {plugin.versionStatus === "conflicting" ? <p>Declared versions: {plugin.observedVersions.join(", ")}</p> : null}</>} />)}
        </table>
      </div>
      <EvidenceTools correctionSteps={[]} evidenceJson={{ contractVersion: projection.contractVersion,
        scanId: projection.scanId, sourceHash: projection.sourceHash, evidenceRef: projection.evidenceRef,
        capturedAt: projection.capturedAt, documentUrl: projection.documentUrl,
        detections: assessment.detections, signals: projection.signals, pluginInventory: projection.pluginInventory,
        technologyInventory: inventory }} />
      {projection.signals.length ? <details className="border-t border-zinc-100 pt-3 text-xs text-zinc-600">
        <summary className="cursor-pointer font-medium">All source evidence</summary>
        <ul className="mt-2 space-y-2">{projection.signals.map(signal => <li id={signal.evidenceRef} key={signal.evidenceRef} className="break-words">
          <span className="font-medium">{sourceLabels[signal.kind]}: </span><span className="break-all">{signal.value}</span>
          {signal.kind === "asset_path" || signal.kind === "core_asset_version" || signal.kind === "feed_generator" ? <a className="ml-2 text-sky-700 underline" href={signal.sourceUrl} target="_blank" rel="noopener noreferrer">View source</a> : null}
        </li>)}</ul>
      </details> : null}
    </div>
  </details>;
}
