export type AdminRequestAdmissionInput = {
  interruptionReason?: string | null;
  linkedScanId?: string | null;
  requestResolutionMode?: string | null;
  rowKind: "request" | "scan";
  status: string;
};

export type AdminRequestAdmissionPresentation = {
  detail: string;
  freshnessLabel: "Not admitted";
  label: "Expired" | "Failed" | "Rate limited" | "Rejected";
};

function normalizedValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function projectAdminRequestAdmission(
  input: AdminRequestAdmissionInput
): AdminRequestAdmissionPresentation | null {
  if (input.rowKind !== "request" || input.linkedScanId) return null;

  const status = normalizedValue(input.status);
  const resolutionMode = normalizedValue(input.requestResolutionMode);
  const detail = input.interruptionReason?.trim() || null;

  if (status === "rejected" || status === "rate_limited") {
    const rateLimited = status === "rate_limited" || resolutionMode === "rate_limited";
    return {
      detail: detail ?? (rateLimited ? "Request was not admitted because a request limit was reached." : "Request was not admitted."),
      freshnessLabel: "Not admitted",
      label: rateLimited ? "Rate limited" : "Rejected"
    };
  }
  if (status === "failed") {
    return {
      detail: detail ?? "Request failed before a scan was created.",
      freshnessLabel: "Not admitted",
      label: "Failed"
    };
  }
  if (status === "expired") {
    return {
      detail: detail ?? "Request expired before a scan was created.",
      freshnessLabel: "Not admitted",
      label: "Expired"
    };
  }
  return null;
}
