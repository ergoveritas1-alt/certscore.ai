import type { ValidationEvidencePacket } from "./repository";
import type { ValidationVerdict } from "@website-signal-risk-scanner/shared";

export type ValidationSystemConfidenceBand = "very_high" | "high" | "moderate" | "low" | "very_low";

export type ValidationSystemConfidenceResult = {
  band: ValidationSystemConfidenceBand;
  explanation: string;
  score: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDetectorStrengthScore(value: ValidationEvidencePacket["reviewPolicy"]["detectorStrength"]) {
  if (value === "weak") {
    return 0.2;
  }

  if (value === "medium") {
    return 0.4;
  }

  return 0.6;
}

function getGapPenalty(value: ValidationEvidencePacket["reviewPolicy"]["gapTolerance"], missingEvidenceCount: number) {
  if (missingEvidenceCount === 0) {
    return 0;
  }

  if (value === "high") {
    return 0.05;
  }

  if (value === "low") {
    return Math.min(0.2, 0.1 * missingEvidenceCount);
  }

  return Math.min(0.15, 0.075 * missingEvidenceCount);
}

function getSupportStrength(input: ValidationEvidencePacket) {
  let score = 0;

  if (input.supportingSignals.length > 0) {
    score += 0.1;
  }

  if (input.runtimeEvidence.length > 0) {
    score += 0.1;
  }

  if (input.policyEvidence.length > 0) {
    score += 0.05;
  }

  const vendorSignal = input.supportingSignals.some((signal) => /vendor/i.test(signal.key) || /vendor/i.test(signal.label));
  if (vendorSignal) {
    score += 0.1;
  }

  const numericStrengthSignal = input.supportingSignals.some(
    (signal) => typeof signal.value === "number" && Number.isFinite(signal.value) && signal.value > 0
  );
  if (numericStrengthSignal) {
    score += 0.05;
  }

  return Math.min(0.3, score);
}

function getVerdictAdjustment(verdict: ValidationVerdict) {
  if (verdict === "supported") {
    return 0.05;
  }

  if (verdict === "not_supported") {
    return -0.2;
  }

  return -0.05;
}

function getBand(score: number): ValidationSystemConfidenceBand {
  if (score >= 0.9) {
    return "very_high";
  }

  if (score >= 0.75) {
    return "high";
  }

  if (score >= 0.6) {
    return "moderate";
  }

  if (score >= 0.4) {
    return "low";
  }

  return "very_low";
}

export function computeValidationSystemConfidence(input: {
  evidence: ValidationEvidencePacket;
  verdict: ValidationVerdict;
}): ValidationSystemConfidenceResult {
  const detectorStrength = getDetectorStrengthScore(input.evidence.reviewPolicy.detectorStrength);
  const supportStrength = getSupportStrength(input.evidence);
  const gapPenalty = getGapPenalty(input.evidence.reviewPolicy.gapTolerance, input.evidence.missingEvidence.length);
  const contraryPenalty = 0;
  const verdictAdjustment = getVerdictAdjustment(input.verdict);

  const score = clamp(detectorStrength + supportStrength + verdictAdjustment - gapPenalty - contraryPenalty, 0, 1);
  const band = getBand(score);

  return {
    band,
    explanation: `Detector ${input.evidence.reviewPolicy.detectorStrength}; support ${supportStrength.toFixed(2)}; gaps penalty ${gapPenalty.toFixed(2)}; verdict ${input.verdict}.`,
    score: Number(score.toFixed(2))
  };
}
