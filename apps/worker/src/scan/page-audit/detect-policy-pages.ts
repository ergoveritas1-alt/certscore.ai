import { COMMERCE_SIGNAL_TERMS, POLICY_URL_KEYWORDS, type PolicyType } from "./policy-keywords";

export type PolicyDetectionResult = {
  commerceSignalsObserved: boolean;
  policies: Record<
    PolicyType,
    {
      candidateUrls: string[];
      found: boolean;
    }
  >;
};

function normalizeUrlPath(url: string) {
  return new URL(url).pathname.toLowerCase();
}

function matchesAnyKeyword(url: string, keywords: string[]) {
  const haystack = normalizeUrlPath(url);
  return keywords.some((keyword) => haystack.includes(keyword));
}

export function detectPolicyPages(input: { discoveredUrls: string[]; selectedUrls: string[] }): PolicyDetectionResult {
  const candidateUrls = [...new Set([...input.selectedUrls, ...input.discoveredUrls])];

  const policies: PolicyDetectionResult["policies"] = {
    privacy: {
      candidateUrls: candidateUrls.filter((url) => matchesAnyKeyword(url, POLICY_URL_KEYWORDS.privacy)),
      found: false
    },
    terms: {
      candidateUrls: candidateUrls.filter((url) => matchesAnyKeyword(url, POLICY_URL_KEYWORDS.terms)),
      found: false
    },
    cookie: {
      candidateUrls: candidateUrls.filter((url) => matchesAnyKeyword(url, POLICY_URL_KEYWORDS.cookie)),
      found: false
    },
    refund: {
      candidateUrls: candidateUrls.filter((url) => matchesAnyKeyword(url, POLICY_URL_KEYWORDS.refund)),
      found: false
    }
  };

  for (const policyType of Object.keys(policies) as PolicyType[]) {
    policies[policyType].found = policies[policyType].candidateUrls.length > 0;
  }

  return {
    policies,
    commerceSignalsObserved: candidateUrls.some((url) => matchesAnyKeyword(url, COMMERCE_SIGNAL_TERMS))
  };
}
