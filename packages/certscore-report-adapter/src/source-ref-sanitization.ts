import type {
  DisplaySafeEvidenceExcerpt,
  EvidenceRef,
} from "@certscore/contracts";
import type { V2ReportProjectionDraft } from "./index";

const LONG_OPAQUE_PATH_TOKEN_PATTERN = /[A-Za-z0-9_-]{48,}/;
const LONG_HEX_PATH_TOKEN_PATTERN = /^[a-f0-9]{32,}$/i;
const REDACTED_QUERY_PARAM_NAME = "redacted_param";
const REDACTED_COOKIE_NAME = "redacted_cookie_name";

export function sanitizeEvidenceRefs(refs: EvidenceRef[]): EvidenceRef[] {
  return refs.map((ref) => ({
    ...ref,
    url: ref.url ? redactUrlLikeValue(ref.url) : undefined,
    label: ref.label ? redactUrlLikeValue(ref.label) : undefined,
    path: ref.path ? redactUrlLikeValue(ref.path) : undefined,
    excerpt: ref.excerpt ? truncate(ref.excerpt, 500) : undefined,
  }));
}

export function normalizeV2ProjectionSourceEvidenceRefs(
  projection: V2ReportProjectionDraft,
): V2ReportProjectionDraft {
  const rows = projection.rows.map((row) => {
    const sourceEvidenceRefs = sanitizeEvidenceRefs(row.sourceEvidenceRefs);
    const displaySafeExcerpts = row.evidencePacket.displaySafeExcerpts.map(sanitizeDisplaySafeExcerpt);
    return {
      ...row,
      sourceEvidenceRefs,
      evidencePacket: {
        ...row.evidencePacket,
        sourceEvidenceRefs,
        displaySafeExcerpts,
        displaySafeExcerptStats: {
          ...row.evidencePacket.displaySafeExcerptStats,
          representativeGroupKeys: row.evidencePacket.displaySafeExcerptStats.representativeGroupKeys
            .map(redactRepresentativeGroupKey),
        },
      },
    };
  });

  return {
    ...projection,
    rows,
    wc01CompatibleRows: projection.wc01CompatibleRows.map((row) => {
      const sourceRow = rows.find((item) => item.findingKey === row.sourceFindingKey);
      return sourceRow
        ? {
            ...row,
            evidenceRefs: sourceRow.sourceEvidenceRefs.map((ref) => ref.refId),
            retainedEvidence: {
              ...row.retainedEvidence,
              sourceEvidenceRefIds: sourceRow.sourceEvidenceRefs.map((ref) => ref.refId),
            },
          }
        : row;
    }),
  };
}

function sanitizeDisplaySafeExcerpt(excerpt: DisplaySafeEvidenceExcerpt): DisplaySafeEvidenceExcerpt {
  return {
    ...excerpt,
    displayValueRedacted: excerpt.displayValueRedacted
      ? redactDisplaySafeValue(excerpt.displayValueRedacted)
      : undefined,
    path: excerpt.path ? redactUrlLikeValue(excerpt.path) : undefined,
    queryParamNames: excerpt.queryParamNames.map(redactUnsafeQueryParamName),
    cookieNames: excerpt.cookieNames.map(redactUnsafeCookieName),
  };
}

function redactUrlLikeValue(value: string) {
  try {
    const url = new URL(value);
    url.pathname = redactUnsafePath(url.pathname);
    const queryNames = Array.from(url.searchParams.keys())
      .map(redactUnsafeQueryParamName)
      .sort();
    url.search = queryNames.length > 0
      ? queryNames.map((name) => `${encodeURIComponent(name)}=<redacted>`).join("&")
      : "";
    url.hash = "";
    return url.toString();
  } catch {
    const [withoutQuery] = value.split("?");
    return redactUnsafePath(withoutQuery ?? value);
  }
}

function redactDisplaySafeValue(value: string) {
  const cookieAssignment = value.match(/^([^=\s]+)=\[redacted\]$/);
  if (cookieAssignment) {
    return `${redactUnsafeCookieName(cookieAssignment[1]!)}=[redacted]`;
  }
  return redactUrlLikeValue(value);
}

function redactUnsafePath(value: string) {
  return redactPathParameterValues(value)
    .split("/")
    .map(redactUnsafePathSegment)
    .join("/");
}

function redactUnsafePathSegment(segment: string) {
  if (!segment) {
    return segment;
  }
  const decoded = safeDecodeURIComponent(segment);
  if (
    !LONG_OPAQUE_PATH_TOKEN_PATTERN.test(decoded) &&
    !LONG_HEX_PATH_TOKEN_PATTERN.test(decoded)
  ) {
    return segment;
  }

  const extension = decoded.match(/(\.[A-Za-z0-9]{1,8})$/)?.[1] ?? "";
  return `<redacted>${extension}`;
}

function redactUnsafeQueryParamName(name: string) {
  const decoded = safeDecodeURIComponent(name);
  if (
    !LONG_OPAQUE_PATH_TOKEN_PATTERN.test(decoded) &&
    !LONG_HEX_PATH_TOKEN_PATTERN.test(decoded)
  ) {
    return name;
  }
  return REDACTED_QUERY_PARAM_NAME;
}

function redactUnsafeCookieName(name: string) {
  const decoded = safeDecodeURIComponent(name);
  if (
    !LONG_OPAQUE_PATH_TOKEN_PATTERN.test(decoded) &&
    !LONG_HEX_PATH_TOKEN_PATTERN.test(decoded)
  ) {
    return name;
  }
  return REDACTED_COOKIE_NAME;
}

function redactRepresentativeGroupKey(value: string) {
  return value
    .split("|")
    .map((segment) => {
      if (segment.includes("=")) {
        return redactDisplaySafeValue(segment);
      }
      return redactUnsafeCookieName(redactUrlLikeValue(segment));
    })
    .join("|");
}

function redactPathParameterValues(value: string) {
  return value.replace(/([:;&/][A-Za-z0-9_.-]{2,}=)[^:;&/?#]+/g, "$1<redacted>");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
