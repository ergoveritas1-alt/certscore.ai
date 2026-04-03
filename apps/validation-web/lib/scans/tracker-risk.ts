export function formatTrackerRiskLabel(label: string) {
  return label.replace(/_/g, " ");
}

export function getTrackerSeverity(input: {
  vendorCategory: string;
  vendorName: string;
  collectionEndpointType?: string | null;
}) {
  let score = 1;

  if (input.vendorCategory === "advertising") {
    score = Math.max(score, 4);
  }
  if (input.vendorCategory === "session_replay") {
    score = Math.max(score, 4);
  }
  if (input.vendorCategory === "fingerprinting") {
    score = Math.max(score, 4);
  }
  if (/(segment|rudderstack|mparticle|tealium)/i.test(input.vendorName)) {
    score = Math.max(score, 3);
  }
  if (input.vendorCategory === "tag_manager") {
    score = Math.max(score, 3);
  }
  if (input.vendorCategory === "analytics") {
    score = Math.max(score, 2);
  }
  if (input.collectionEndpointType === "first_party_collection_proxy") {
    score = Math.min(4, score + 1);
  }

  const label = score >= 4 ? "high" : score === 3 ? "medium" : "low";

  return {
    label,
    score
  } as const;
}

export function formatTrackerSeverityLabel(label: "low" | "medium" | "high") {
  return `${label} severity`;
}

export function getTrackerRiskLabels(input: {
  vendorCategory: string;
  vendorName: string;
  collectionEndpointType?: string | null;
}) {
  const labels = new Set<string>();

  if (input.vendorCategory === "advertising") {
    labels.add("advertising");
  }
  if (input.vendorCategory === "session_replay") {
    labels.add("session replay");
  }
  if (input.vendorCategory === "fingerprinting") {
    labels.add("fingerprinting");
  }
  if (input.vendorCategory === "analytics") {
    labels.add("analytics");
  }
  if (input.vendorCategory === "tag_manager") {
    labels.add("tag manager");
  }
  if (/(segment|rudderstack|mparticle|tealium)/i.test(input.vendorName)) {
    labels.add("CDP");
  }
  if (input.collectionEndpointType === "first_party_collection_proxy") {
    labels.add("first-party collection endpoint");
  }

  return [...labels];
}

export function formatCollectionEndpointType(value: string | null | undefined) {
  if (!value || value === "unknown") {
    return "Unknown endpoint path";
  }
  if (value === "direct_third_party") {
    return "Direct third-party endpoint";
  }
  if (value === "first_party_subdomain") {
    return "First-party subdomain endpoint";
  }
  if (value === "first_party_collection_proxy") {
    return "First-party collection proxy";
  }

  return value;
}
