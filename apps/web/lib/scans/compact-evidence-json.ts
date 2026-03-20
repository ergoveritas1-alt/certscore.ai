const MAX_ARRAY_SAMPLE = 5;
const MAX_STRING_LENGTH = 240;

function compactLongString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

export function compactEvidenceJsonForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) {
    const compactedItems = value.slice(0, MAX_ARRAY_SAMPLE).map((entry) => compactEvidenceJsonForDisplay(entry));
    if (value.length <= MAX_ARRAY_SAMPLE) {
      return compactedItems;
    }

    return {
      sample: compactedItems,
      totalCount: value.length,
      truncated: true
    };
  }

  if (typeof value === "string") {
    return compactLongString(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, compactEvidenceJsonForDisplay(entry)])
  );
}
