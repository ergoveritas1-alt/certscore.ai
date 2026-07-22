import { createHash } from "node:crypto";
import type {
  CanonicalShadowCoverageRow,
  CanonicalShadowScoreFinding
} from "./canonical-shadow-score";

function fingerprint(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function buildCanonicalShadowScoreProjectionComponents(input: {
  coverageRows: CanonicalShadowCoverageRow[];
  findings: CanonicalShadowScoreFinding[];
}) {
  const coverageRows = [...input.coverageRows].sort((left, right) =>
    left.rowId.localeCompare(right.rowId)
  );
  const findings = [...input.findings].sort((left, right) =>
    left.family.localeCompare(right.family) ||
    left.findingId.localeCompare(right.findingId) ||
    left.severity.localeCompare(right.severity)
  );

  return {
    coverageProjectionFingerprint: fingerprint(coverageRows),
    coverageRowCount: coverageRows.length,
    findingProjectionFingerprint: fingerprint(findings),
    findingCount: findings.length
  };
}

export type CanonicalShadowScoreProjectionComponents = ReturnType<
  typeof buildCanonicalShadowScoreProjectionComponents
>;
