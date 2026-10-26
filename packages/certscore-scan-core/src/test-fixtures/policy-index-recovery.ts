import type { PolicySurfaceScannerInput } from "../scanners/policy-surface-scanner.js";

export type IndexRecoveryMode = boolean | "homepage";

export function policyIndexRecoveryFixtureOptions(
  baseUrl: string,
  scanStartedAtMs: number,
  renderedRecovery: IndexRecoveryMode,
): Pick<PolicySurfaceScannerInput, "policySurfaceSeeds" | "nanoAssistProvider"> {
  return {
    // Synthetic fixture history: guessed routes are direct-only. Only the two
    // prior-hint cases may recover /privacy through browser navigation.
    policySurfaceSeeds: renderedRecovery === true ? [{
      url: `${baseUrl}/privacy`,
      hintType: "privacy_policy",
      source: "prior_scan_hint",
      sourceCompletedAt: new Date(scanStartedAtMs - 60_000).toISOString(),
      sourceScanId: "fixture-prior-policy-index",
      confidence: 0.95,
    }] : [],
    nanoAssistProvider: {
      async classifyLinks(input) {
        return {
          assistId: input.assistId,
          rankedCandidates: input.candidates
            .filter(candidate => candidate.fetchable && !candidate.observationOnly &&
              candidate.deterministicSurfaceType !== "unknown" && candidate.deterministicScore >= 0.5)
            .slice(0, 8)
            .map((candidate, index) => ({
              candidateId: candidate.candidateId,
              likelySurfaceType: candidate.deterministicSurfaceType,
              shouldFetch: true,
              priorityRank: index + 1,
              confidence: candidate.deterministicScore,
              reason: "Deterministic fixture mock; no model call.",
            })),
        };
      },
    },
  };
}

export interface IndexRecoveryFixtureRequest {
  baseUrl: string;
  url: string;
  navigation: boolean;
  renderedRecovery: IndexRecoveryMode;
  delayedNotice: boolean;
  multilingual: boolean;
  slowHtml?: boolean;
}

/** Pure fixture responses: the integration adapter alone owns timers and HTTP. */
export function policyIndexRecoveryFixtureResponse(input: IndexRecoveryFixtureRequest): {
  status: number; headers: Record<string, string>; body: string; delayMs: number;
} {
  const { baseUrl, url, navigation, renderedRecovery, delayedNotice, multilingual, slowHtml } = input;
  const policy = "We collect personal data for service delivery. Our legal basis is contractual necessity. We retain account records for two years. Contact privacy@example.test to exercise your right to access, delete or object. We transfer data using standard contractual clauses. ".repeat(20);
  const index = `<h1>Consumer Privacy Policy</h1><p>${"Choose your regional privacy policy. We care about your privacy. ".repeat(12)}</p><a href="/policycenter/b2c/en-us">English (US) Privacy Policy</a><a href="/policycenter/b2c/en-emea">English (Europe) Privacy Policy</a>`;
  const notice = (file: string) => `<main>Processing Error</main><script>OneTrust.NoticeApi.LoadNotices(["${baseUrl}/${file}"]${multilingual && file === "europe.json" ? ', true, "en-gb"' : ""})</script>`;
  const result = { status: 200, headers: { "content-type": url.endsWith(".json") ? "application/json" : "text/html" } as Record<string, string>, body: "", delayMs: 0 };
  switch (url) {
    case "/":
      if (renderedRecovery && !(renderedRecovery === "homepage" && navigation)) {
        result.status = 403; result.body = "Forbidden";
      } else result.body = '<footer><a href="/policycenter/b2c">Privacy Policy</a></footer>';
      break;
    case "/privacy":
      if (!renderedRecovery || !navigation) { result.status = 403; result.body = "Forbidden"; }
      else { result.status = 302; result.headers.location = "/policycenter/b2c"; }
      break;
    case "/policycenter/b2c": result.body = notice("index.json") + '<header><a href="/policycenter/b2c/en-us">Privacy Policy</a></header>'; break;
    case "/index.json": result.body = JSON.stringify({ languages: { en: { policyUrl: `${baseUrl}/index-body.json` } } }); break;
    case "/index-body.json": result.body = JSON.stringify({ notices: [{ content: index }] }); break;
    case "/policycenter/b2c/en-emea": result.status = 301; result.headers.location = "/policycenter/b2c/en-emea/"; break;
    case "/policycenter/b2c/en-emea/": result.body = notice("europe.json"); result.delayMs = slowHtml ? 3200 : 0; break;
    case "/english-body.json": result.body = JSON.stringify({ notices: [{ content: `<h1>Europe Privacy Policy</h1><p>${policy}</p>` }] }); result.delayMs = slowHtml ? 650 : 0; break;
    case "/europe.json":
      if (multilingual) result.body = JSON.stringify({ languages: { de: { policyUrl: baseUrl + "/wrong-locale.json" }, "en-gb": { policyUrl: baseUrl + "/english-body.json" } } });
      else {
        result.body = JSON.stringify({ notices: [{ content: `<h1>Europe Privacy Policy</h1><p>${policy}</p>` }] });
        result.delayMs = delayedNotice ? 3000 : 0;
      }
      break;
    case "/policycenter/b2c/en-us": result.body = "Processing Error Privacy Policy Cookie Settings"; break;
    default: result.status = 404; result.body = "Not found";
  }
  return result;
}
