type MaterializationFailureDisposition = {
  code: "contract_validation_failed" | "materialization_failed_transient";
  diagnostic: string;
  retryable: boolean;
};

function errorChain(error: unknown) {
  const chain: unknown[] = [];
  let current = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    chain.push(current);
    current = current instanceof Error
      ? current.cause
      : null;
  }
  return chain;
}

function isSchemaValidationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return (
    record.name === "ZodError" ||
    Array.isArray(record.issues)
  );
}

function lifecyclePhase(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const match = /^Score lifecycle ([a-z0-9-]+) failed(?:[:.]|$)/i.exec(message);
  return match?.[1] ?? null;
}

export function classifyScoreMaterializationFailure(error: unknown): MaterializationFailureDisposition {
  const chain = errorChain(error);
  const phase = chain.map(lifecyclePhase).find((value) => value !== null);
  if (chain.some(isSchemaValidationError)) {
    return {
      code: "contract_validation_failed",
      diagnostic: phase
        ? `contract_validation_failed:${phase}`
        : "contract_validation_failed",
      retryable: false,
    };
  }
  return {
    code: "materialization_failed_transient",
    diagnostic: phase
      ? `materialization_failed_transient:${phase}`
      : "materialization_failed_transient",
    retryable: true,
  };
}
