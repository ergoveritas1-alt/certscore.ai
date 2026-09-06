// Only schema-owned path segments may enter diagnostics. Never log rejected
// values, raw Zod messages (which can contain those values), or bundled stacks.
const safeFields = new Set([
  "storage", "preAction", "postAction", "name", "storageType", "hostname",
  "identityBasis", "identityHash", "storageIdentityHash", "valueHash",
  "writesAfterAccept", "writesAfterRefusal", "itemsCreatedOrChangedAfterAccept",
  "nonEssentialItemsPersistingAfterRefusal", "network", "requests", "observations",
  "acceptanceRegistration", "refusalRegistration", "decisionEvidence", "captureCoverage",
  "actionControlProof", "afterActionCapture", "timing", "resolver", "limitations",
]);

export function evidenceValidationFailure(error: unknown): { code: string; message: string } | undefined {
  if (!(error instanceof Error) || error.name !== "ZodError" || !("issues" in error) || !Array.isArray(error.issues)) return;
  const issues = error.issues.slice(0, 6).map((issue: unknown) => {
    if (!issue || typeof issue !== "object") return "packet (invalid)";
    const record = issue as { path?: unknown; code?: unknown };
    const path = Array.isArray(record.path) ? record.path.slice(0, 8).map(segment =>
      typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0 ? `[${segment}]`
        : typeof segment === "string" && safeFields.has(segment) ? segment : "[field]"
    ).join(".") : "packet";
    const code = typeof record.code === "string" && /^[a-z_]{1,40}$/.test(record.code) ? record.code : "invalid";
    return `${path || "packet"} (${code})`;
  });
  return {
    code: "v2_dag_lambda_evidence_invalid",
    message: `Evidence validation failed: ${issues.join("; ")}${error.issues.length > 6 ? "; further issues omitted" : ""}`.slice(0, 500),
  };
}
