import type { Page } from "playwright";
import { POLICY_CONTENT_KEYWORDS, type PolicyType } from "./policy-keywords";

export type PolicyContentCheckResult = {
  matchedConcepts: string[];
  policyType: PolicyType;
  representativeSnippets: string[];
  url: string;
};

export async function checkPolicyContent(input: {
  page: Page;
  policyType: PolicyType;
  url: string;
}): Promise<PolicyContentCheckResult> {
  const keywordConfig = POLICY_CONTENT_KEYWORDS[input.policyType];

  return input.page.evaluate(
    ({ concepts, policyType, url }) => {
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").toLowerCase().slice(0, 20_000);
      const matchedConcepts: string[] = [];
      const snippets = new Set<string>();

      for (const [concept, keywords] of Object.entries(concepts)) {
        const matchedKeyword = keywords.find((keyword) => text.includes(keyword.toLowerCase()));

        if (!matchedKeyword) {
          continue;
        }

        matchedConcepts.push(concept);
        const matchIndex = text.indexOf(matchedKeyword.toLowerCase());

        if (matchIndex >= 0 && snippets.size < 3) {
          snippets.add(text.slice(Math.max(0, matchIndex - 40), Math.min(text.length, matchIndex + 120)).trim());
        }
      }

      return {
        policyType,
        url,
        matchedConcepts,
        representativeSnippets: [...snippets].slice(0, 3)
      };
    },
    {
      concepts: keywordConfig,
      policyType: input.policyType,
      url: input.url
    }
  );
}
