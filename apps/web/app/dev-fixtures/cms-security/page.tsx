import React from "react";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectCmsSecurity } from "../../../server/scans/cms-security-projection";
import { buildUnifiedFindingDisplayPackets } from "../../../lib/scans/unified-findings";
import { buildSitePriorityReview } from "../../../lib/scans/full-site-priority-review";
import { CmsSecurityEvidence } from "../../../components/scans/cms-security-evidence";
import { SitePriorityReview } from "../../../components/scans/site-priority-review";
import { FullSiteExecutiveSummary } from "../../../components/scans/full-site-executive-summary";
export const dynamic = "force-dynamic";
const examples: Record<string, string[]> = {
  wordpress: ["WordPress 4.5.33"], modern: ["WordPress 6.8"], "wordpress-unknown": ["WordPress"],
  joomla: ["Joomla! 5.2.4"], drupal: ["Drupal 10.4.2"], magento: ["Magento 2.4.7-p5"],
  adobe: ["Adobe Commerce 2.4.8"], prestashop: ["PrestaShop 8.2.2"], typo3: ["TYPO3 13.4.2"], opencart: ["OpenCart 4.2.0.0"],
  fixed: ["Drupal 10.4.3"], unsupported: ["Joomla 3.10.12"], unknown: ["Drupal 10"], hosted: ["Shopify"], conflicting: ["Drupal 10.4.2", "Drupal 11.1.3"],
};
export default async function CmsSecurityFixture({ searchParams }: { searchParams: Promise<{ example?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const selected = (await searchParams).example ?? "joomla";
  const generators = examples[selected];
  if (!generators) notFound();
  const url = "https://cms.fixture.example/";
  const bundle = { scanId: "cms-development-fixture", startedAt: "2026-09-17T00:00:00.000Z", completedAt: "2026-09-17T00:00:10.000Z", domSnapshots: [],
    runtimeMetadataSnapshots: [{ url, artifactId: "runtime:dom:1", capturedAtMs: 1000, consentStateAtTime: "pre_consent", documentIdentity: { token: "fixture-loader" },
      siteMetadata: { contractVersion: "certscore.site-metadata.v1", title: "CMS fixture", language: "en", generators, wordpressAssetObserved: false, versionEvidence: [] } }],
  } as unknown as CanonicalEvidenceBundle;
  const projection = projectCmsSecurity(bundle, { verificationStatus: "verified", sha256: createHash("sha256").update(JSON.stringify(bundle)).digest("hex") }, url);
  if (!projection) throw new Error("CMS fixture projection failed");
  const packets = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: { cmsSecurity: projection }, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const priorities = buildSitePriorityReview([], [{ id: "home", url, homepage: true, findingIds: [] }], [], packets);
  const verdict = priorities.length ? priorities.map(row => `${row.title}: ${row.summary}`).join(" ") : "No eligible CMS security warning in this fixture. Unknown versions and hosted services remain informational.";
  return <main className="mx-auto max-w-6xl p-4">
    <h1 className="text-xl font-semibold">CMS security · local MVP preview</h1>
    <p className="my-2 text-sm text-zinc-600">Synthetic test evidence using the production projection, concern policy and report components. No customer scan is modified.</p>
    <nav aria-label="CMS examples" className="my-4 flex flex-wrap gap-2">{Object.keys(examples).map(example => <a aria-current={selected === example ? "page" : undefined} className="rounded border border-zinc-300 px-3 py-2 text-sm text-sky-700 aria-[current=page]:bg-sky-100" href={`?example=${example}`} key={example}>{example}</a>)}</nav>
    <FullSiteExecutiveSummary pending={false} scannedPages={1} statusLabel="Development fixture" score={{ value: 100, scoredPages: 1, priorityReview: priorities }} homepageVerdict={verdict}
      snapshot={<p className="text-sm text-zinc-600">CMS security warnings are score-neutral in this MVP.</p>} />
    <SitePriorityReview findings={priorities} pending={false} sitewideAvailable scannedPages={1} />
    <h2 className="mt-6 text-xl font-semibold">Detailed evidence</h2>
    <CmsSecurityEvidence projection={projection} />
  </main>;
}
