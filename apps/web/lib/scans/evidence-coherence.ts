type CoherenceStatus = "pass" | "fail" | "unknown";

export type EvidenceCoherenceResult = {
  status: CoherenceStatus;
  dimension: string;
  reason: string;
};

type VendorEndpointRule = {
  id: string;
  labelPattern: RegExp;
  endpointPattern: RegExp;
};

const SESSION_REPLAY_VENDOR_ENDPOINT_RULES: VendorEndpointRule[] = [
  {
    id: "fullstory",
    labelPattern: /\bfullstory\b|\bfull story\b|\bfs\.js\b/i,
    endpointPattern: /(^|\.)fullstory\.com$|(^|\.)fs\.fullstory\.com$|(^|\.)fullstory\.dev$/i
  },
  {
    id: "hotjar",
    labelPattern: /\bhotjar\b/i,
    endpointPattern: /(^|\.)hotjar\.com$|(^|\.)hotjar\.io$/i
  },
  {
    id: "contentsquare",
    labelPattern: /\bcontentsquare\b|\bcontent square\b|\bclicktale\b/i,
    endpointPattern: /(^|\.)contentsquare\.net$|(^|\.)contentsquare\.com$|(^|\.)clicktale\.net$/i
  },
  {
    id: "logrocket",
    labelPattern: /\blogrocket\b/i,
    endpointPattern: /(^|\.)logrocket\.com$|(^|\.)lr-ingest\.io$/i
  },
  {
    id: "mouseflow",
    labelPattern: /\bmouseflow\b/i,
    endpointPattern: /(^|\.)mouseflow\.com$/i
  },
  {
    id: "clarity",
    labelPattern: /\b(?:microsoft )?clarity\b/i,
    endpointPattern: /(^|\.)clarity\.ms$|(^|\.)bing\.com$/i
  }
];

const CHAT_VENDOR_ENDPOINT_RULES: VendorEndpointRule[] = [
  {
    id: "intercom",
    labelPattern: /\bintercom\b/i,
    endpointPattern: /(^|\.)intercom\.io$|(^|\.)intercomcdn\.com$/i
  },
  {
    id: "zendesk",
    labelPattern: /\bzendesk\b|\bzopim\b/i,
    endpointPattern: /(^|\.)zendesk\.com$|(^|\.)zdassets\.com$|(^|\.)zopim\.com$/i
  },
  {
    id: "livechat",
    labelPattern: /\blivechat\b/i,
    endpointPattern: /(^|\.)livechatinc\.com$|(^|\.)livechat\.com$/i
  },
  {
    id: "drift",
    labelPattern: /\bdrift\b/i,
    endpointPattern: /(^|\.)drift\.com$|(^|\.)driftt\.com$/i
  },
  {
    id: "salesforce",
    labelPattern: /\bsalesforce\b|\blive agent\b/i,
    endpointPattern: /(^|\.)salesforce\.com$|(^|\.)force\.com$|(^|\.)salesforceliveagent\.com$/i
  }
];

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function getHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function hasValue(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

function getMappedVendorCoherence(input: {
  dimension: string;
  requestUrls: string[];
  rules: VendorEndpointRule[];
  vendorLabels: string[];
}) {
  const vendorLabels = uniqueStrings(input.vendorLabels);
  const requestUrls = uniqueStrings(input.requestUrls);
  const mappedRows = vendorLabels
    .map((label) => ({
      label,
      rules: input.rules.filter((rule) => rule.labelPattern.test(label))
    }))
    .filter((row) => row.rules.length > 0);
  const coherentRequestUrls = requestUrls.filter((url) => {
    const hostname = getHostname(url);
    return mappedRows.some((row) => row.rules.some((rule) => rule.endpointPattern.test(hostname)));
  });
  const unmatchedVendorLabels = mappedRows
    .filter((row) => !requestUrls.some((url) => {
      const hostname = getHostname(url);
      return row.rules.some((rule) => rule.endpointPattern.test(hostname));
    }))
    .map((row) => row.label);

  return {
    coherentRequestUrls,
    mappedVendorLabels: mappedRows.map((row) => row.label),
    status: mappedRows.length === 0
      ? "unknown"
      : unmatchedVendorLabels.length === 0 && coherentRequestUrls.length > 0
        ? "pass"
        : "fail",
    unmatchedVendorLabels
  } as const;
}

export function evaluateVendorRequestUrlCoherence(input: {
  requestUrls: string[];
  vendorLabels: string[];
}) {
  return getMappedVendorCoherence({
    dimension: "vendor_request_url_coherence",
    requestUrls: input.requestUrls,
    rules: [
      ...SESSION_REPLAY_VENDOR_ENDPOINT_RULES,
      ...CHAT_VENDOR_ENDPOINT_RULES
    ],
    vendorLabels: input.vendorLabels
  });
}

export function evaluateSessionReplayVendorRequestUrlCoherence(input: {
  requestUrls: string[];
  vendorLabels: string[];
}) {
  return getMappedVendorCoherence({
    dimension: "vendor_request_url_coherence",
    requestUrls: input.requestUrls,
    rules: SESSION_REPLAY_VENDOR_ENDPOINT_RULES,
    vendorLabels: input.vendorLabels
  });
}

export function evaluateChatVendorRequestUrlCoherence(input: {
  requestUrls: string[];
  vendorLabels: string[];
}) {
  return getMappedVendorCoherence({
    dimension: "vendor_request_url_coherence",
    requestUrls: input.requestUrls,
    rules: CHAT_VENDOR_ENDPOINT_RULES,
    vendorLabels: input.vendorLabels
  });
}

export function evaluatePolicySnippetContextCoherence(snippets: string[]) {
  const retainedSnippets = uniqueStrings(snippets);
  const privacySpecificSnippets = retainedSnippets.filter((snippet) =>
    /\b(?:consumer|privacy|data|california|ccpa|cpra|access|delete|correct|portability|opt[- ]?out|do not sell|do not share|limit use)\b/i.test(snippet)
  );
  return {
    retainedSnippets,
    privacySpecificSnippets,
    status: privacySpecificSnippets.length > 0 ? "pass" : retainedSnippets.length > 0 ? "fail" : "unknown"
  } as const;
}

export function isBlockedOrInterstitialEvidence(value: string | null | undefined) {
  return Boolean(value && /\b(?:blocked|captcha|challenge|access denied|verify you are human|security check|waf|firewall|cloudflare|email the site owner|site owner|enable cookies|interstitial)\b/i.test(value));
}

export function evaluateSurfaceNotBlockedOrInterstitial(input: {
  snippets?: string[];
  urls?: string[];
}) {
  const blockedSnippets = uniqueStrings(input.snippets ?? []).filter(isBlockedOrInterstitialEvidence);
  const blockedUrls = uniqueStrings(input.urls ?? []).filter(isBlockedOrInterstitialEvidence);
  const totalEvidenceCount = uniqueStrings([...(input.snippets ?? []), ...(input.urls ?? [])]).length;
  const blockedEvidenceCount = blockedSnippets.length + blockedUrls.length;
  return {
    blockedSnippets,
    blockedUrls,
    status: blockedEvidenceCount === 0 ? "pass" : blockedEvidenceCount >= totalEvidenceCount ? "fail" : "unknown"
  } as const;
}

export function evaluateControlPathVerificationCoherence(input: {
  labels?: string[];
  snippets?: string[];
  types?: string[];
  urls?: string[];
}) {
  const values = uniqueStrings([
    ...(input.labels ?? []),
    ...(input.snippets ?? []),
    ...(input.types ?? []),
    ...(input.urls ?? [])
  ]);
  const methodValues = values.filter((value) =>
    /\b(?:request|rights?|access|delete|correct|portability|appeal|privacy choices|privacy request|data request|consumer request|do not sell|do not share|limit use|opt[- ]?out|portal|form|email|phone|toll[- ]?free|submit)\b|mailto:|\/privacy|\/rights|\/ccpa|\/cpra|\/privacyrequest|\/privacy-request|\/data-request/i.test(value)
  );
  const blocked = evaluateSurfaceNotBlockedOrInterstitial({ snippets: values, urls: input.urls });
  return {
    methodValues,
    status: blocked.status === "fail"
      ? "fail"
      : methodValues.length > 0
        ? "pass"
        : values.length > 0 ? "fail" : "unknown",
    surfaceNotBlockedOrInterstitial: blocked
  } as const;
}

export function evaluateInteractionStateCoherence(input: {
  actionConfirmed?: boolean | null;
  savedOrApplied?: boolean | null;
}) {
  return {
    status: input.actionConfirmed === true && input.savedOrApplied === true ? "pass" : "fail",
    actionConfirmed: input.actionConfirmed ?? null,
    savedOrApplied: input.savedOrApplied ?? null
  } as const;
}

export function evaluateSameFlowContextCoherence(input: {
  evidenceSources?: string[];
  requestUrls?: string[];
  sameFlowObserved?: boolean | null;
  sensitiveSurfaceUrls?: string[];
  trackerPageUrls?: string[];
}) {
  const evidenceSources = uniqueStrings(input.evidenceSources ?? []);
  const sameFlowEvidence =
    input.sameFlowObserved === true ||
    evidenceSources.some((source) => /\bsame[_ -]?flow|sensitive[_ -]?field[_ -]?(?:third[_ -]?party[_ -]?tracking|session[_ -]?replay)[_ -]?correlation\b/i.test(source));
  const sensitiveHosts = new Set(uniqueStrings(input.sensitiveSurfaceUrls ?? []).map(getHostname));
  const trackerHosts = uniqueStrings(input.trackerPageUrls ?? input.requestUrls ?? []).map(getHostname);
  const hostOverlap = sensitiveHosts.size > 0 && trackerHosts.some((host) => sensitiveHosts.has(host));
  return {
    evidenceSources,
    sameFlowEvidence,
    status: sameFlowEvidence || hostOverlap ? "pass" : "fail"
  } as const;
}

export function evaluateThirdPartyReceiptCoherence(input: {
  explicitThirdPartyReceiptObserved?: boolean | null;
  firstPartyHosts?: string[];
  requestUrls?: string[];
}) {
  const firstPartyHosts = uniqueStrings(input.firstPartyHosts ?? []).map((host) => host.toLowerCase());
  const requestHosts = uniqueStrings(input.requestUrls ?? []).map(getHostname);
  const thirdPartyRequestHosts = requestHosts.filter((host) =>
    firstPartyHosts.length === 0 ||
    !firstPartyHosts.some((firstPartyHost) => host === firstPartyHost || host.endsWith(`.${firstPartyHost}`))
  );
  return {
    requestHosts,
    status: input.explicitThirdPartyReceiptObserved === true && thirdPartyRequestHosts.length > 0 ? "pass" : input.explicitThirdPartyReceiptObserved === true ? "fail" : "unknown",
    thirdPartyRequestHosts
  } as const;
}

export function hasConcreteUrlOrSnippet(values: Array<string | null | undefined>) {
  return hasValue(uniqueStrings(values));
}
