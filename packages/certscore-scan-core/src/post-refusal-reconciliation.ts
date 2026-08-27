import {
  postRefusalReconciliationEnvelopeSchema,
  type PostRefusalEvidencePacket,
  type PostRefusalReconciliationEnvelope,
} from "@certscore/contracts";
import { createHash } from "node:crypto";
import type { PostRefusalReportPublicationDecision } from "./post-refusal-orchestration.js";

export function buildPostRefusalReconciliationEnvelope(input: {
  parentScanId: string;
  baseEvidence: unknown;
  packet: PostRefusalEvidencePacket;
  publicationDecision: PostRefusalReportPublicationDecision;
}): PostRefusalReconciliationEnvelope {
  const confirmed = input.packet.refusalRegistration.status === "confirmed" &&
    input.packet.refusalRegistration.refusalExercised;
  const joined = confirmed && input.publicationDecision.mode === "single_reconciliation";

  return postRefusalReconciliationEnvelopeSchema.parse({
    artifactVersion: "certscore.post_refusal_reconciliation.v1",
    artifactOnly: true,
    productionProjectable: false,
    parentScanId: input.parentScanId,
    baseEvidenceSha256: canonicalSha256(input.baseEvidence),
    postRefusalPacketSha256: canonicalSha256(input.packet),
    createdAt: new Date().toISOString(),
    status: reconciliationStatus(input.packet),
    disposition: joined ? "joined_at_canonical_barrier" : "not_joined",
    observationCount: input.packet.observations.length,
    refusalExercised: input.packet.refusalRegistration.refusalExercised,
    limitations: [
      "artifact_only_reconciliation_record",
      "canonical_projection_not_enabled",
      ...(input.publicationDecision.mode === "single_reconciliation_limited"
        ? ["canonical_join_deadline_exceeded"]
        : []),
    ],
  });
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function reconciliationStatus(
  packet: PostRefusalEvidencePacket,
): PostRefusalReconciliationEnvelope["status"] {
  switch (packet.refusalRegistration.status) {
    case "confirmed":
      return packet.observations.length > 0 ? "confirmed_observation" : "confirmed_clean";
    case "unconfirmed":
      return "unconfirmed";
    case "not_attempted":
      return "not_attempted";
    case "unsupported":
      return "unsupported";
    case "aborted":
      return "aborted";
  }
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`
  ).join(",")}}`;
}
