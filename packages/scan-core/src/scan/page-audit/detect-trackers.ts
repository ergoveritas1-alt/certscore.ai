import type { Page, Request } from "playwright";
import { TRACKER_SIGNATURES, type TrackerSignature } from "./tracker-signatures";

export type DetectedTracker = {
  matchedCount: number;
  matchedRequestUrls: string[];
  signature: TrackerSignature;
};

type TrackerMatchState = {
  requestUrls: Set<string>;
};

function matchesSignature(requestUrl: URL, signature: TrackerSignature) {
  const hostnameMatch = signature.hostnamePatterns.some(
    (pattern) => requestUrl.hostname === pattern || requestUrl.hostname.endsWith(`.${pattern}`)
  );

  if (!hostnameMatch) {
    return false;
  }

  if (!signature.pathFragments || signature.pathFragments.length === 0) {
    return true;
  }

  const fullPath = `${requestUrl.pathname}${requestUrl.search}`.toLowerCase();

  return signature.pathFragments.some((fragment) => fullPath.includes(fragment.toLowerCase()));
}

export function attachTrackerDetector(page: Page) {
  const matches = new Map<string, TrackerMatchState>();

  function onRequest(request: Request) {
    try {
      const requestUrl = new URL(request.url());
      const matchedSignature = TRACKER_SIGNATURES.find((signature) => matchesSignature(requestUrl, signature));

      if (!matchedSignature) {
        return;
      }

      const existingMatch = matches.get(matchedSignature.key) ?? {
        requestUrls: new Set<string>()
      };

      existingMatch.requestUrls.add(request.url());
      matches.set(matchedSignature.key, existingMatch);
    } catch {
      return;
    }
  }

  page.on("request", onRequest);

  return {
    getTrackers(): DetectedTracker[] {
      return TRACKER_SIGNATURES.flatMap((signature) => {
        const matchedState = matches.get(signature.key);

        if (!matchedState) {
          return [];
        }

        const matchedRequestUrls = [...matchedState.requestUrls].slice(0, 5);

        return [
          {
            signature,
            matchedCount: matchedState.requestUrls.size,
            matchedRequestUrls
          }
        ];
      });
    },
    detach() {
      page.off("request", onRequest);
    }
  };
}
