import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  generateWc01V2EvidencePreviewPacket,
  parseWc01V2ManualReviewerPacketJson,
  type Wc01V2EvidencePreviewPacket,
} from "./wc01-v2-evidence-preview";
import {
  generateWc01V2EvidencePreviewBatch,
  generateWc01V2EvidencePreviewSingleFromFile,
} from "./wc01-v2-evidence-preview-output";
import type { Wc01V2ManualReviewerPacket } from "./wc01-v2-manual-reviewer-packet";

test("valid evidence lookup resolves sourceRefId and displaySafeExcerptId", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-"));
  try {
    const { reviewerPacketPath, artifactRoot } = await writePreviewFixture(tmp);

    const preview = await generateWc01V2EvidencePreviewPacket({
      reviewerPacketPath,
      artifactRoots: [artifactRoot],
    });
    const item = preview.queueItems[0];

    assert.ok(item);
    assert.equal(item.resolvedEvidenceExcerpts.length, 1);
    assert.equal(item.resolvedEvidenceExcerpts[0]?.boundedText, "collector.example.com/collect");
    assert.equal(item.resolvedSourceRefs.length, 1);
    assert.equal(item.resolvedSourceRefs[0]?.url, "https://collector.example.com/collect?cid=%3Credacted%3E");
    assert.equal(item.unresolvedEvidenceRefs.length, 0);
    assertNoForbiddenOutput(preview);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("representative grouping uses deterministic safe keys and top-N samples", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-groups-"));
  try {
    const sourceRefIds = Array.from({ length: 12 }, (_, index) => `ref_collect_${index + 1}`);
    const excerptIds = Array.from({ length: 7 }, (_, index) => `excerpt_collect_${index + 1}`);
    const { reviewerPacketPath, artifactRoot, siteDir } = await writePreviewFixture(tmp, {
      excerptIds,
      sourceRefIds,
    });
    const longOpaque = "abcDEF123_".repeat(8);
    await writeFile(join(siteDir, "artifact.json"), JSON.stringify({
      sourceEvidenceRefs: sourceRefIds.map((refId, index) => ({
        refId,
        label: `https://collector.example.com/collect/${longOpaque}/${index}`,
        url: `https://collector.example.com/collect/${longOpaque}/${index}`,
      })),
      displaySafeExcerpts: excerptIds.map((excerptId, index) => ({
        excerptId,
        sourceRefIds,
        evidenceKind: "network_request",
        displayLabel: "Collection endpoint request",
        displayValueRedacted: `collector.example.com/collect/${longOpaque}/${index}`,
        hostname: "collector.example.com",
      })),
    }), "utf8");

    const preview = await generateWc01V2EvidencePreviewPacket({
      reviewerPacketPath,
      artifactRoots: [artifactRoot],
    });
    const item = preview.queueItems[0];
    assert.ok(item);
    const group = item.representativeEvidenceGroups.find((candidate) =>
      candidate.totalResolvedExcerpts === 7
    );
    assert.ok(group);
    assert.equal(group.totalResolvedExcerpts, 7);
    assert.equal(group.totalResolvedSourceRefs, 12);
    assert.equal(group.representativeExcerpts.length, 5);
    assert.equal(group.representativeSourceRefs.length, 10);
    assert.doesNotMatch(group.groupKey, /abcDEF123/);
    assert.match(group.groupKey, /collector\.example\.com/);
    assert.equal(
      preview.redactionWarnings.some((warning) =>
        warning.category === "bounded_excerpt_value_redacted" &&
        warning.displayDisposition === "displayed_with_redaction" &&
        warning.count === 7
      ),
      true,
    );
    assert.equal(
      preview.redactionWarnings.some((warning) =>
        warning.category === "source_ref_url_redacted" && warning.count === 12
      ),
      true,
    );
    assertNoForbiddenOutput(preview);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("missing source ref and missing excerpt ref are unresolved fail-closed items", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-missing-"));
  try {
    const { reviewerPacketPath, artifactRoot } = await writePreviewFixture(tmp, {
      sourceRefIds: ["ref_missing"],
      excerptIds: ["excerpt_missing"],
    });

    const preview = await generateWc01V2EvidencePreviewPacket({
      reviewerPacketPath,
      artifactRoots: [artifactRoot],
    });

    assert.equal(preview.queueItems[0]?.resolvedEvidenceExcerpts.length, 0);
    assert.equal(preview.queueItems[0]?.resolvedSourceRefs.length, 0);
    assert.equal(preview.unresolvedEvidenceRefs.length, 2);
    assert.equal(preview.unresolvedEvidenceRefs.every((ref) => ref.reason === "missing"), true);
    assert.deepEqual(
      preview.unresolvedEvidenceRefs.map((ref) => ref.reasonCode).sort(),
      ["excerpt_id_not_found", "source_ref_id_not_found"],
    );
    assert.equal(
      preview.redactionWarnings.some((warning) =>
        warning.category === "evidence_not_found_fail_closed" &&
        warning.displayDisposition === "omitted_fail_closed"
      ),
      true,
    );
    assertNoForbiddenOutput(preview);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("ambiguous excerpt lineage is unresolved without evidence text", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-ambiguous-"));
  try {
    const { reviewerPacketPath, artifactRoot, siteDir } = await writePreviewFixture(tmp);
    await writeFile(join(siteDir, "ambiguous.json"), JSON.stringify({
      displaySafeExcerpts: [{
        excerptId: "excerpt_collect",
        displayLabel: "Different",
        displayValueRedacted: "different.example.com/collect",
        evidenceKind: "network_request",
        hostname: "different.example.com",
      }],
    }), "utf8");

    const preview = await generateWc01V2EvidencePreviewPacket({
      reviewerPacketPath,
      artifactRoots: [artifactRoot],
    });

    const item = preview.queueItems[0];
    assert.ok(item);
    assert.equal(item.resolvedEvidenceExcerpts.length, 0);
    assert.equal(item.unresolvedEvidenceRefs.some((ref) =>
      ref.refId === "excerpt_collect" && ref.reasonCode === "ambiguous_lineage"
    ), true);
    assert.equal(
      preview.redactionWarnings.some((warning) => warning.category === "ambiguous_lineage_fail_closed"),
      true,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("matching source finding key resolves cross-row source-ref ambiguity", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-context-"));
  try {
    const { reviewerPacketPath, artifactRoot, siteDir } = await writePreviewFixture(tmp);
    await writeFile(join(siteDir, "artifact.json"), JSON.stringify({
      rows: [
        {
          findingKey: "third_party_vendors_observed",
          sourceEvidenceRefs: [{
            refId: "ref_collect",
            label: "https://inventory.example.test/collect",
            url: "https://inventory.example.test/collect",
          }],
          evidence: {
            displaySafeExcerpts: [{
              excerptId: "excerpt_collect",
              sourceEventId: "collect",
              evidenceKind: "network_request",
              displayValueRedacted: "inventory.example.test/collect",
              hostname: "inventory.example.test",
            }],
          },
        },
        {
          findingKey: "pre_consent_tracking_detected",
          sourceEvidenceRefs: [{
            refId: "ref_collect",
            label: "https://collector.example.com/collect?cid=%3Credacted%3E",
            url: "https://collector.example.com/collect?cid=%3Credacted%3E",
          }],
          evidence: {
            displaySafeExcerpts: [{
              excerptId: "excerpt_collect",
              sourceEventId: "collect",
              evidenceKind: "network_request",
              displayValueRedacted: "collector.example.com/collect",
              hostname: "collector.example.com",
            }],
          },
        },
      ],
    }), "utf8");

    const preview = await generateWc01V2EvidencePreviewPacket({
      reviewerPacketPath,
      artifactRoots: [artifactRoot],
    });
    const item = preview.queueItems[0];

    assert.ok(item);
    assert.equal(item.resolvedSourceRefs[0]?.url, "https://collector.example.com/collect?cid=%3Credacted%3E");
    assert.equal(item.resolvedEvidenceExcerpts[0]?.boundedText, "collector.example.com/collect");
    assert.equal(item.unresolvedEvidenceRefs.length, 0);
    assertNoForbiddenOutput(preview);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("raw blocked fields, unsupported version, and malformed reviewer packets fail closed", () => {
  assert.throws(
    () => parseWc01V2ManualReviewerPacketJson(JSON.stringify({
      ...reviewerPacketFixture(),
      requestBody: "raw",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => parseWc01V2ManualReviewerPacketJson(JSON.stringify({
      ...reviewerPacketFixture(),
      packetVersion: "unsupported",
    })),
    /Unsupported Wc01V2ManualReviewerPacket version/,
  );
  assert.throws(
    () => parseWc01V2ManualReviewerPacketJson("{not-json"),
    /Unexpected token|Expected property name/,
  );
});

test("long opaque values are redacted in bounded preview output", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-redact-"));
  try {
    const longOpaque = "abcDEF123_".repeat(8);
    const { reviewerPacketPath, artifactRoot, siteDir } = await writePreviewFixture(tmp);
    await writeFile(join(siteDir, "artifact.json"), JSON.stringify({
      rows: [{
        evidence: {
          displaySafeExcerpts: [{
            excerptId: "excerpt_collect",
            displayLabel: "Collection",
            displayValueRedacted: `collector.example.com/${longOpaque}`,
            evidenceKind: "network_request",
          }],
          sourceEvidenceRefs: [{
            refId: "ref_collect",
            label: `https://collector.example.com/${longOpaque}`,
            url: `https://collector.example.com/${longOpaque}`,
          }],
        },
      }],
    }), "utf8");

    const preview = await generateWc01V2EvidencePreviewPacket({
      reviewerPacketPath,
      artifactRoots: [artifactRoot],
    });

    assert.match(JSON.stringify(preview), /<redacted_opaque_value>/);
    assert.equal(preview.redactionWarnings.length > 0, true);
    assertNoForbiddenOutput(preview);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("sensitive-context preview carries categories without eligibility", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-sensitive-"));
  try {
    const { reviewerPacketPath, artifactRoot } = await writePreviewFixture(tmp, {
      sensitiveCategories: ["reproductive_health"],
    });

    const preview = await generateWc01V2EvidencePreviewPacket({
      reviewerPacketPath,
      artifactRoots: [artifactRoot],
    });

    assert.deepEqual(preview.queueItems[0]?.sensitiveContextCategories, ["reproductive_health"]);
    assert.equal(preview.productionEligible, false);
    assert.equal(preview.queueItems[0]?.productionEligible, false);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("single-file and batch output write summaries, and batch continues on malformed sites", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-evidence-preview-batch-"));
  try {
    const good = await writePreviewFixture(tmp, { inputRoot: "input/good", artifactRootName: "artifacts" });
    await mkdir(join(tmp, "input", "bad"), { recursive: true });
    await writeFile(join(tmp, "input", "bad", "Wc01V2ManualReviewerPacket.json"), "{not-json", "utf8");

    const singleOut = join(tmp, "single", "Wc01V2EvidencePreviewPacket.json");
    const single = await generateWc01V2EvidencePreviewSingleFromFile({
      reviewerPacketPath: good.reviewerPacketPath,
      artifactRoots: [good.artifactRoot],
      outPath: singleOut,
    });
    assert.equal(single.summary.resolvedExcerptCount, 1);
    assert.ok(JSON.parse(await readFile(singleOut, "utf8")) as Wc01V2EvidencePreviewPacket);

    const batch = await generateWc01V2EvidencePreviewBatch({
      inputDir: join(tmp, "input"),
      outDir: join(tmp, "out"),
      artifactRoots: [good.artifactRoot],
    });
    assert.equal(batch.totalInputFilesFound, 2);
    assert.equal(batch.succeededCount, 1);
    assert.equal(batch.failedCount, 1);
    assert.equal(batch.resolvedExcerptCount, 1);
    assert.equal(batch.representativeGroupCount > 0, true);
    assert.equal(batch.malformedArtifacts.length, 1);
    const markdown = await readFile(join(tmp, "single", "Wc01V2EvidencePreviewPacket.summary.md"), "utf8");
    assert.match(markdown, /Representative Evidence Groups/);
    assert.match(markdown, /Unresolved Evidence Ref Counts/);
    assert.equal(markdown.includes("| ref_missing |"), false);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("evidence preview modules do not import production policy, report, checklist, executive, scoring, or shared scan detail builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-evidence-preview.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-evidence-preview-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-evidence-preview.ts"), "utf8"),
  ].join("\n")
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");

  assert.doesNotMatch(sources, /apps\/web\/.*concern-policy/);
  assert.doesNotMatch(sources, /normalized-concerns/);
  assert.doesNotMatch(sources, /unified-findings/);
  assert.doesNotMatch(sources, /coverage-checklist/);
  assert.doesNotMatch(sources, /executive-summary/);
  assert.doesNotMatch(sources, /top-finding/);
  assert.doesNotMatch(sources, /scoring/);
  assert.doesNotMatch(sources, /regulatory-lens/);
  assert.doesNotMatch(sources, /shared-scan-detail-view/);
});

async function writePreviewFixture(
  tmp: string,
  options: {
    artifactRootName?: string;
    excerptIds?: string[];
    inputRoot?: string;
    sensitiveCategories?: string[];
    sourceRefIds?: string[];
  } = {},
) {
  const inputDir = join(tmp, options.inputRoot ?? "reviewer", "example.com");
  const artifactRoot = join(tmp, options.artifactRootName ?? "artifact-root");
  const siteDir = join(artifactRoot, "example.com");
  await mkdir(inputDir, { recursive: true });
  await mkdir(siteDir, { recursive: true });
  const packet = reviewerPacketFixture({
    excerptIds: options.excerptIds,
    sensitiveCategories: options.sensitiveCategories,
    sourceRefIds: options.sourceRefIds,
  });
  const reviewerPacketPath = join(inputDir, "Wc01V2ManualReviewerPacket.json");
  await writeFile(reviewerPacketPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  await writeFile(join(siteDir, "artifact.json"), JSON.stringify({
    sourceEvidenceRefs: [{
      refId: "ref_collect",
      eventId: "collect",
      eventType: "network_request",
      label: "https://collector.example.com/collect?cid=%3Credacted%3E",
      url: "https://collector.example.com/collect?cid=%3Credacted%3E",
    }],
    displaySafeExcerpts: [{
      excerptId: "excerpt_collect",
      sourceEventId: "collect",
      sourceEventType: "network_request",
      evidenceKind: "network_request",
      displayLabel: "Collection endpoint request",
      displayValueRedacted: "collector.example.com/collect",
      hostname: "collector.example.com",
      sensitivity: "safe",
    }],
  }), "utf8");
  return { artifactRoot, reviewerPacketPath, siteDir };
}

function reviewerPacketFixture(options: {
  excerptIds?: string[];
  sensitiveCategories?: string[];
  sourceRefIds?: string[];
} = {}): Wc01V2ManualReviewerPacket {
  const sourceRefIds = options.sourceRefIds ?? ["ref_collect"];
  const displaySafeExcerptIds = options.excerptIds ?? ["excerpt_collect"];
  const sensitiveCategories = options.sensitiveCategories ?? [];
  return {
    packetVersion: "wc01.v2_manual_reviewer_packet.1",
    sourceArtifact: {
      comparisonVersion: "wc01.v2_concern_policy_comparison_dry_run.1",
      sourceUrl: "https://example.com",
      scanId: "scan_example",
      reviewId: "review_example",
      adapterVersion: "wc01.v2_normalized_concern_candidate_draft.1",
    },
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    status: "manual_reviewer_packet_internal_only",
    internalOnlyBanner: "Internal shadow diagnostic only. Not customer-facing report output.",
    candidateCount: 1,
    queueItemCount: 1,
    queueItems: [{
      queueItemId: "review_packet.candidate_1",
      candidateId: "candidate_1",
      sourceFindingKey: "pre_consent_tracking_detected",
      candidateFamily: "pre_consent_tracking",
      proposedNormalizedConcernKey: "v2.pre_consent_tracking.candidate",
      simulatedPolicyOutcome: sensitiveCategories.length > 0
        ? "would_remain_internal_only"
        : "would_accept_for_internal_review",
      queueLane: sensitiveCategories.length > 0
        ? "sensitive_context_review_required"
        : "standard_internal_review_candidate",
      reviewFlags: ["copy_policy_review_required"],
      sensitiveContext: {
        present: sensitiveCategories.length > 0,
        requiresExtraReview: sensitiveCategories.length > 0,
        categories: sensitiveCategories,
        metadataAvailable: true,
      },
      evidence: {
        sourceRefIds,
        displaySafeExcerptIds,
        displaySafeExcerptCount: displaySafeExcerptIds.length,
        sourceRefsAvailable: sourceRefIds.length > 0,
        displaySafeExcerptRefsAvailable: displaySafeExcerptIds.length > 0,
        comparisonArtifactOnly: true,
      },
      vendorDiagnostics: {
        vendorNames: ["Example Vendor"],
        supportingPurposes: ["analytics"],
        diagnosticPurposes: ["tag_management"],
        metadataAvailable: true,
      },
      evidenceQuality: {
        confidence: "high",
        directness: "direct",
        metadataAvailable: true,
      },
      caveats: ["candidate_shape_matches_mock_policy_requirements"],
      missingRequirements: [],
      coverageLimitations: [],
      familyEvidenceContext: {
        consentStateContext: {
          phase: "pre_consent",
          actionObserved: "choice_not_made",
          sourceRefIds,
        },
      },
      guardrailStatus: {
        productionEligible: false,
        topFindingEligible: false,
        gapEligible: false,
        noGapObserved: true,
        noLegalConclusionLanguage: true,
        noRawBlockedFields: true,
      },
    }],
    reviewerActionOptions: [{
      action: "evidence_shape_confirmed",
      productionEligible: false,
      topFindingEligible: false,
      gapEligible: false,
    }],
    blockedCandidates: [],
    guardrails: {
      noProductionConcernPolicyCall: true,
      noPersistence: true,
      noUnifiedFindings: true,
      noReportMutation: true,
      noChecklistExecutiveScoringImports: true,
      noCustomerFacingCopy: true,
      noGapObserved: true,
      noLegalConclusionLanguage: true,
      noRawBlockedFields: true,
      noProductionEligibility: true,
      noTopFindingEligibility: true,
      noGapEligibility: true,
    },
  };
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /gap_observed/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
}
