import {
  postRefusalSupplementEnvelopeSchema,
  type PostRefusalEvidencePacket,
  type PostRefusalSupplementEnvelope,
} from "@certscore/contracts";
import { createHash } from "node:crypto";
import type { PostRefusalReportPublicationDecision } from "./post-refusal-orchestration.js";

export function buildPostRefusalSupplementEnvelope(input: {
  parentScanId: string;
  baseEvidence: unknown;
  packet: PostRefusalEvidencePacket;
  publicationDecision: PostRefusalReportPublicationDecision;
  baseGeneration?: number;
}): PostRefusalSupplementEnvelope {
  const baseGeneration = Math.max(0, Math.round(input.baseGeneration ?? 0));
  const confirmed = input.packet.refusalRegistration.status === "confirmed" &&
    input.packet.refusalRegistration.refusalExercised;
  const status = supplementStatus(input.packet);
  const disposition = !confirmed
    ? "neutral_no_projection" as const
    : input.publicationDecision.mode === "late_generation"
      ? "late_generation_candidate" as const
      : "opportunistic_initial_join_candidate" as const;

  return postRefusalSupplementEnvelopeSchema.parse({
    artifactVersion: "certscore.post_refusal_supplement.v1",
    artifactOnly: true,
    productionProjectable: false,
    parentScanId: input.parentScanId,
    baseEvidenceSha256: canonicalSha256(input.baseEvidence),
    postRefusalPacketSha256: canonicalSha256(input.packet),
    createdAt: new Date().toISOString(),
    status,
    disposition,
    ...(disposition === "neutral_no_projection"
      ? {}
      : {
          reportGeneration: {
            baseGeneration,
            candidateGeneration: baseGeneration + 1,
          },
        }),
    observationCount: input.packet.observations.length,
    refusalExercised: input.packet.refusalRegistration.refusalExercised,
    limitations: [
      "artifact_only_candidate_not_persisted",
      "canonical_projection_not_enabled",
    ],
  });
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function supplementStatus(packet: PostRefusalEvidencePacket): PostRefusalSupplementEnvelope["status"] {
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
