type SupabaseErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function getConfiguredSupabaseHost() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
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
    const record = error as SupabaseErrorLike;
    append(record.message);
    append(record.details);
    append(record.hint);
    append(record.code);
  }

  return values.join("\n");
}

export function describeSupabaseError(error: unknown) {
  const combined = flattenErrorText(error);
  const configuredHost = getConfiguredSupabaseHost();

  if (/ENOTFOUND/i.test(combined)) {
    const hostClause = configuredHost ? ` (${configuredHost})` : "";
    return `Supabase host could not be resolved${hostClause}. Check NEXT_PUBLIC_SUPABASE_URL in apps/web/.env.local and point localhost at a live dev project.`;
  }

  if (/ECONNREFUSED|connection refused/i.test(combined)) {
    const hostClause = configuredHost ? ` (${configuredHost})` : "";
    return `Supabase refused the connection${hostClause}. Ensure the configured project or local Supabase API is running and reachable.`;
  }

  if (/ETIMEDOUT|timed out/i.test(combined)) {
    const hostClause = configuredHost ? ` (${configuredHost})` : "";
    return `Supabase timed out${hostClause}. Confirm network access and that the configured project is reachable from this machine.`;
  }

  const fallbackMessage = readErrorPart(
    error instanceof Error ? error.message : error && typeof error === "object" ? (error as SupabaseErrorLike).message : null
  );
  const details = readErrorPart(error && typeof error === "object" ? (error as SupabaseErrorLike).details : null);

  if (fallbackMessage && details && details !== fallbackMessage) {
    return `${fallbackMessage} ${details}`;
  }

  return fallbackMessage ?? "Unknown Supabase error.";
}

export function buildSupabaseOperationError(operation: string, error: unknown) {
  return new Error(`${operation}: ${describeSupabaseError(error)}`);
}
