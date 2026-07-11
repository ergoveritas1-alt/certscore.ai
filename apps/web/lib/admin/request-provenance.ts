export type AdminRequestProvenanceKind =
  | "anonymous_public"
  | "authenticated_user"
  | "gpt_action"
  | "internal_import"
  | "internal_system"
  | "unknown"
  | "validation_ops";

export type AdminRequestProvenance = {
  className: string;
  kind: AdminRequestProvenanceKind;
  label: string;
  tone: "amber" | "emerald" | "indigo" | "sky" | "slate" | "violet";
};

type ClassifyAdminRequestProvenanceInput = {
  organizationName?: string | null;
  requestChannel?: string | null;
  requestedByAnonymous?: boolean | null;
  requesterName?: string | null;
  requesterIp?: string | null;
  source?: string | null;
};

const PROVENANCE_BY_KIND: Record<AdminRequestProvenanceKind, Omit<AdminRequestProvenance, "kind">> = {
  anonymous_public: {
    className: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
    label: "Anonymous public",
    tone: "slate"
  },
  authenticated_user: {
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    label: "Authenticated user",
    tone: "emerald"
  },
  gpt_action: {
    className: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
    label: "GPT Action",
    tone: "violet"
  },
  internal_import: {
    className: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
    label: "Internal import",
    tone: "indigo"
  },
  internal_system: {
    className: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
    label: "Internal system",
    tone: "sky"
  },
  unknown: {
    className: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
    label: "Unknown provenance",
    tone: "slate"
  },
  validation_ops: {
    className: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    label: "Validation ops",
    tone: "amber"
  }
};

export function adminRequestProvenance(kind: AdminRequestProvenanceKind): AdminRequestProvenance {
  return {
    kind,
    ...PROVENANCE_BY_KIND[kind]
  };
}

export function classifyAdminRequestProvenance(input: ClassifyAdminRequestProvenanceInput): AdminRequestProvenance {
  const organizationName = normalizeComparableText(input.organizationName);
  const requestChannel = normalizeComparableText(input.requestChannel);
  const source = normalizeComparableText(input.source);

  if (organizationName === "certscore corpus import") {
    return adminRequestProvenance("internal_import");
  }

  if (organizationName === "validation ops internal") {
    return adminRequestProvenance("validation_ops");
  }

  if (requestChannel === "gpt action" || requestChannel === "gpt_action" || source === "gpt action" || source === "gpt_action") {
    return adminRequestProvenance("gpt_action");
  }

  if (source.includes("corpus") || source.includes("batch eval") || source.includes("codex scan batch eval")) {
    return adminRequestProvenance("internal_import");
  }

  if (source.includes("validation ops") || source.includes("validation_ops")) {
    return adminRequestProvenance("validation_ops");
  }

  if (input.organizationName && organizationName !== "public / anonymous") {
    return adminRequestProvenance("authenticated_user");
  }

  if (input.requesterName || input.requestedByAnonymous === false) {
    return adminRequestProvenance("authenticated_user");
  }

  if (
    input.requestedByAnonymous === true ||
    organizationName === "public / anonymous" ||
    input.requesterIp ||
    source === "pulse api" ||
    source === "pulse_api" ||
    source === "marketing anonymous full scan" ||
    source === "marketing-anonymous-full-scan" ||
    requestChannel === "pulse api" ||
    requestChannel === "pulse_api" ||
    requestChannel === "marketing anonymous full scan" ||
    requestChannel === "marketing-anonymous-full-scan"
  ) {
    return adminRequestProvenance("anonymous_public");
  }

  if (source.includes("prod manifest") || source.includes("load test") || source.includes("scheduler") || source.includes("scheduled monitoring")) {
    return adminRequestProvenance("internal_system");
  }

  return adminRequestProvenance("unknown");
}

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").trim().replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ").toLowerCase();
}
