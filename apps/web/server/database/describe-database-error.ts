type DatabaseErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function getConfiguredDatabaseHost() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function readErrorPart(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function flattenErrorText(error: unknown) {
  const values: string[] = [];
  const append = (value: unknown) => {
    const text = readErrorPart(value);
    if (text) {
      values.push(text);
    }
  };

  if (error instanceof Error) {
    append(error.message);
    append(error.cause instanceof Error ? error.cause.message : error.cause);
  }

  if (error && typeof error === "object") {
    const record = error as DatabaseErrorLike;
    append(record.message);
    append(record.details);
    append(record.hint);
    append(record.code);
  }

  return values.join("\n");
}

export function describeDatabaseError(error: unknown) {
  const combined = flattenErrorText(error);
  const configuredHost = getConfiguredDatabaseHost();

  if (/ENOTFOUND/i.test(combined)) {
    const hostClause = configuredHost ? ` (${configuredHost})` : "";
    return `Database host could not be resolved${hostClause}. Check DATABASE_URL and confirm the Postgres host is reachable from this machine.`;
  }

  if (/ECONNREFUSED|connection refused/i.test(combined)) {
    const hostClause = configuredHost ? ` (${configuredHost})` : "";
    return `Database refused the connection${hostClause}. Ensure the configured Postgres instance is running and reachable.`;
  }

  if (/ETIMEDOUT|timed out/i.test(combined)) {
    const hostClause = configuredHost ? ` (${configuredHost})` : "";
    return `Database timed out${hostClause}. Confirm network access and that the configured Postgres instance is reachable from this machine.`;
  }

  const fallbackMessage = readErrorPart(
    error instanceof Error ? error.message : error && typeof error === "object" ? (error as DatabaseErrorLike).message : null
  );
  const details = readErrorPart(error && typeof error === "object" ? (error as DatabaseErrorLike).details : null);

  if (fallbackMessage && details && details !== fallbackMessage) {
    return `${fallbackMessage} ${details}`;
  }

  return fallbackMessage ?? "Unknown database error.";
}

export function buildDatabaseOperationError(operation: string, error: unknown) {
  return new Error(`${operation}: ${describeDatabaseError(error)}`);
}
