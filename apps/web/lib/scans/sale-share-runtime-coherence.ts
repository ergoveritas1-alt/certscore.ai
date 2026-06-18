type VendorEndpointRule = {
  id: string;
  labelPattern: RegExp;
  endpointPattern: RegExp;
};

export type SaleShareApplicabilityBasis =
  | "runtime_vendor_request_url_coherent"
  | "runtime_request_url_only"
  | "policy_sale_share_admission"
  | "policy_personalized_ads_context_only"
  | "vendor_request_url_mismatch"
  | "no_runtime_sale_share_evidence";

export type SaleShareRuntimeCoherence = {
  coherentRequestUrls: string[];
  incoherentVendors: string[];
  knownMappedVendors: string[];
  policyPersonalizedAdsLanguageObserved: boolean;
  policyPersonalizedAdsSnippet: string | null;
  policySaleShareAdmissionObserved: boolean;
  runtimeThirdPartyAdtechObserved: boolean;
  runtimeVendorRequestUrlCoherence: "coherent" | "mismatch" | "not_required" | "not_evaluable";
  saleShareApplicabilityBasis: SaleShareApplicabilityBasis;
  saleShareApplicabilityObserved: boolean | null;
  targetedAdvertisingSignalsObserved: boolean | null;
};

const VENDOR_ENDPOINT_RULES: VendorEndpointRule[] = [
  {
    id: "meta",
    labelPattern: /\b(?:meta|facebook|fb pixel|meta pixel|facebook pixel)\b/i,
    endpointPattern: /(^|\.)facebook\.com$|(^|\.)facebook\.net$|(^|\.)fbcdn\.net$|(^|\.)instagram\.com$|(^|\.)graph\.facebook\.com$/i
  },
  {
    id: "google_ads",
    labelPattern: /\b(?:google ads?|google advertising|google ad services|doubleclick|floodlight|dv360|campaign manager)\b/i,
    endpointPattern: /(^|\.)doubleclick\.net$|(^|\.)googleadservices\.com$|(^|\.)googlesyndication\.com$|(^|\.)googletagservices\.com$/i
  },
  {
    id: "microsoft_advertising",
    labelPattern: /\b(?:microsoft advertising|bing ads?|bing uet|uet tag|clarity)\b/i,
    endpointPattern: /(^|\.)bing\.com$|(^|\.)clarity\.ms$|(^|\.)microsoft\.com$|(^|\.)bat\.bing\.com$|(^|\.)c\.bing\.com$/i
  },
  {
    id: "tiktok",
    labelPattern: /\b(?:tiktok|tik tok)\b/i,
    endpointPattern: /(^|\.)tiktok\.com$|(^|\.)tiktokcdn\.com$|(^|\.)tiktokv\.com$/i
  },
  {
    id: "linkedin",
    labelPattern: /\b(?:linkedin|linkedin insight)\b/i,
    endpointPattern: /(^|\.)linkedin\.com$|(^|\.)licdn\.com$/i
  },
  {
    id: "amazon_ads",
    labelPattern: /\b(?:amazon ads?|amazon advertising|amazon ad system|aax)\b/i,
    endpointPattern: /(^|\.)amazon-adsystem\.com$|(^|\.)amazon\.com$|(^|\.)aax\.amazon-adsystem\.com$/i
  },
  {
    id: "trade_desk",
    labelPattern: /\b(?:the trade desk|tradedesk|adsrvr)\b/i,
    endpointPattern: /(^|\.)adsrvr\.org$|(^|\.)tradedesk\.com$/i
  },
  {
    id: "pinterest",
    labelPattern: /\b(?:pinterest)\b/i,
    endpointPattern: /(^|\.)pinterest\.com$|(^|\.)pinimg\.com$/i
  },
  {
    id: "snap",
    labelPattern: /\b(?:snap pixel|snapchat|snap ads?)\b/i,
    endpointPattern: /(^|\.)snapchat\.com$|(^|\.)sc-static\.net$/i
  },
  {
    id: "reddit",
    labelPattern: /\b(?:reddit ads?|reddit pixel)\b/i,
    endpointPattern: /(^|\.)reddit\.com$|(^|\.)redditstatic\.com$/i
  },
  {
    id: "x_twitter",
    labelPattern: /\b(?:twitter ads?|x ads?|twitter pixel)\b/i,
    endpointPattern: /(^|\.)twitter\.com$|(^|\.)x\.com$|(^|\.)twimg\.com$/i
  },
  {
    id: "criteo",
    labelPattern: /\b(?:criteo)\b/i,
    endpointPattern: /(^|\.)criteo\.com$|(^|\.)criteo\.net$/i
  }
];

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function getUrlHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function getRulesForVendor(vendor: string) {
  return VENDOR_ENDPOINT_RULES.filter((rule) => rule.labelPattern.test(vendor));
}

function getPersonalizedAdsPolicySnippet(snippets: string[]) {
  return snippets.find((snippet) =>
    /\bpersonalized ads?\b|\binterest[- ]based ads?\b|\btargeted advertising\b|\bcross[- ]context behavioral advertising\b/i.test(snippet)
  ) ?? null;
}

function hasExplicitSaleSharePolicyAdmission(snippets: string[]) {
  return snippets.some((snippet) =>
    /\bdo not sell(?: or share)?\b|\bdo not share\b|\bsell or share\b|\bsale\/share\b|\bcross[- ]context behavioral advertising\b|\bshare(?:d|s)? personal information\b|\bsell(?:s|ing)? personal information\b/i.test(snippet)
  );
}

export function evaluateSaleShareRuntimeCoherence(input: {
  advertisingSharingVendors: string[];
  policySaleShareAdmissionObserved?: boolean | null;
  policySaleShareAdmissionConfidence?: string | null;
  policySnippets?: string[];
  saleShareRequestUrls: string[];
  targetedAdvertisingSignalsObserved?: boolean | null;
}): SaleShareRuntimeCoherence {
  const vendors = uniqueStrings(input.advertisingSharingVendors);
  const requestUrls = uniqueStrings(input.saleShareRequestUrls);
  const policySnippets = input.policySnippets ?? [];
  const explicitPolicySaleShareAdmissionObserved = hasExplicitSaleSharePolicyAdmission(policySnippets);
  const policySaleShareAdmissionObserved = input.policySaleShareAdmissionObserved === true && explicitPolicySaleShareAdmissionObserved;
  const highConfidencePolicySaleShareAdmission =
    policySaleShareAdmissionObserved && input.policySaleShareAdmissionConfidence === "high";
  const policyPersonalizedAdsSnippet = getPersonalizedAdsPolicySnippet(policySnippets);
  const policyPersonalizedAdsLanguageObserved = Boolean(policyPersonalizedAdsSnippet);
  const mappedVendorRows = vendors.map((vendor) => ({
    rules: getRulesForVendor(vendor),
    vendor
  })).filter((row) => row.rules.length > 0);
  const coherentRequestUrls = requestUrls.filter((requestUrl) => {
    const hostname = getUrlHostname(requestUrl);
    return mappedVendorRows.some((row) => row.rules.some((rule) => rule.endpointPattern.test(hostname)));
  });
  const incoherentVendors = mappedVendorRows
    .filter((row) => !requestUrls.some((requestUrl) => {
      const hostname = getUrlHostname(requestUrl);
      return row.rules.some((rule) => rule.endpointPattern.test(hostname));
    }))
    .map((row) => row.vendor);
  const knownMappedVendors = mappedVendorRows.map((row) => row.vendor);
  const hasMappedVendors = mappedVendorRows.length > 0;
  const hasRequestUrlEvidence = requestUrls.length > 0;
  const allMappedVendorsCoherent = hasMappedVendors && incoherentVendors.length === 0;
  const runtimeVendorRequestUrlCoherence = hasMappedVendors
    ? allMappedVendorsCoherent
      ? "coherent"
      : "mismatch"
    : vendors.length > 0 && hasRequestUrlEvidence
      ? "not_evaluable"
      : "not_required";
  const runtimeThirdPartyAdtechObserved =
    (allMappedVendorsCoherent && coherentRequestUrls.length > 0) ||
    (!hasMappedVendors && vendors.length > 0 && hasRequestUrlEvidence) ||
    (vendors.length === 0 && hasRequestUrlEvidence);
  const rawTargetedSignal = input.targetedAdvertisingSignalsObserved ?? null;
  const targetedAdvertisingSignalsObserved = runtimeThirdPartyAdtechObserved
    ? true
    : rawTargetedSignal === true && (policyPersonalizedAdsLanguageObserved || policySaleShareAdmissionObserved || vendors.length > 0 || hasRequestUrlEvidence)
      ? null
      : rawTargetedSignal === false
        ? false
        : null;
  const saleShareApplicabilityBasis: SaleShareApplicabilityBasis = runtimeThirdPartyAdtechObserved && allMappedVendorsCoherent
    ? "runtime_vendor_request_url_coherent"
    : runtimeThirdPartyAdtechObserved
      ? "runtime_request_url_only"
      : runtimeVendorRequestUrlCoherence === "mismatch"
        ? "vendor_request_url_mismatch"
        : highConfidencePolicySaleShareAdmission
          ? "policy_sale_share_admission"
          : policyPersonalizedAdsLanguageObserved
            ? "policy_personalized_ads_context_only"
            : "no_runtime_sale_share_evidence";
  const saleShareApplicabilityObserved =
    runtimeThirdPartyAdtechObserved || highConfidencePolicySaleShareAdmission
      ? true
      : rawTargetedSignal === false
        ? false
        : null;

  return {
    coherentRequestUrls,
    incoherentVendors,
    knownMappedVendors,
    policyPersonalizedAdsLanguageObserved,
    policyPersonalizedAdsSnippet,
    policySaleShareAdmissionObserved,
    runtimeThirdPartyAdtechObserved,
    runtimeVendorRequestUrlCoherence,
    saleShareApplicabilityBasis,
    saleShareApplicabilityObserved,
    targetedAdvertisingSignalsObserved
  };
}
