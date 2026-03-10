import type { Page } from "playwright";
import { FTC_DISCLOSURE_TERMS, FTC_SIGNAL_TERMS } from "./ftc-keywords";

export type FtcSignalResult = {
  disclosureObserved: boolean;
  matchedDisclosureTerms: string[];
  matchedSignalTerms: string[];
  representativeSnippets: string[];
};

export async function detectFtcSignals(page: Page): Promise<FtcSignalResult> {
  return page.evaluate(
    ({ disclosureTerms, signalTerms }) => {
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").toLowerCase().slice(0, 20_000);
      const matchedSignalTerms = signalTerms.filter((term) => text.includes(term.toLowerCase())).slice(0, 5);
      const matchedDisclosureTerms = disclosureTerms
        .filter((term) => text.includes(term.toLowerCase()))
        .slice(0, 5);
      const snippets = new Set<string>();

      for (const term of matchedSignalTerms.slice(0, 3)) {
        const matchIndex = text.indexOf(term.toLowerCase());

        if (matchIndex >= 0) {
          snippets.add(text.slice(Math.max(0, matchIndex - 40), Math.min(text.length, matchIndex + 120)).trim());
        }
      }

      return {
        matchedSignalTerms,
        matchedDisclosureTerms,
        representativeSnippets: [...snippets].slice(0, 3),
        disclosureObserved: matchedDisclosureTerms.length > 0
      };
    },
    {
      disclosureTerms: FTC_DISCLOSURE_TERMS,
      signalTerms: FTC_SIGNAL_TERMS
    }
  );
}
