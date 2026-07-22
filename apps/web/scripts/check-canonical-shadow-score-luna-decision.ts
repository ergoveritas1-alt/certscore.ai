import {
  auditLunaScoreDecision,
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  isLunaScoreDecisionApprovedForModel
} from "../lib/scans/canonical-shadow-score-luna-decision";

const errors = auditLunaScoreDecision(GDPR_EPRIVACY_SHADOW_LUNA_DECISION);
const approved = isLunaScoreDecisionApprovedForModel(
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION,
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion
);
const requireApproved = process.argv.includes("--require-approved");

console.log(JSON.stringify({
  approved,
  decisionStatus: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.decisionStatus,
  errors,
  modelVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.modelVersion,
  schemaVersion: GDPR_EPRIVACY_SHADOW_LUNA_DECISION.schemaVersion
}, null, 2));

if (errors.length > 0 || (requireApproved && !approved)) process.exitCode = 1;
