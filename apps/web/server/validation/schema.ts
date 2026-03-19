export function isMissingValidationSchemaError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const normalized = message.toLowerCase();
  return (
    (normalized.includes("validation_settings") ||
      normalized.includes("validation_targets") ||
      normalized.includes("validation_runs") ||
      normalized.includes("validation_run_findings") ||
      normalized.includes("validation_verdicts") ||
      normalized.includes("validation_audit_events")) &&
    (normalized.includes("schema cache") ||
      normalized.includes("could not find the") ||
      normalized.includes("does not exist") ||
      normalized.includes("42703"))
  );
}
