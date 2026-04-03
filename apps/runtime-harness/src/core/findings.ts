import type {
  ConsentUiSummary,
  CookieDetectionRecord,
  FingerprintingSummary,
  PreConsentRequestRecord,
  PreConsentVendorSummary,
  SignalFinding,
  VendorSummary
} from "./types";

type CookieRule = {
  category: "cookie";
  evidenceMatcher: (cookie: CookieDetectionRecord) => boolean;
  severity: SignalFinding["severity"];
  title: string;
};

const COOKIE_RULES: CookieRule[] = [
  {
    category: "cookie",
    evidenceMatcher: (cookie) => cookie.cookieName === "_gcl_au",
    severity: "high",
    title: "Google Ads conversion linker cookie observed before consent"
  },
  {
    category: "cookie",
    evidenceMatcher: (cookie) => cookie.cookieName === "_ga" || cookie.cookieName.startsWith("_ga_"),
    severity: "high",
    title: "Google Analytics cookie observed before consent"
  },
  {
    category: "cookie",
    evidenceMatcher: (cookie) => cookie.cookieName === "_fbp",
    severity: "critical",
    title: "Meta Pixel cookie observed before consent"
  },
  {
    category: "cookie",
    evidenceMatcher: (cookie) => cookie.cookieName === "IDE",
    severity: "critical",
    title: "DoubleClick retargeting cookie observed before consent"
  },
  {
    category: "cookie",
    evidenceMatcher: (cookie) => cookie.cookieName === "_rdt_uuid",
    severity: "high",
    title: "Reddit Ads cookie observed before consent"
  },
  {
    category: "cookie",
    evidenceMatcher: (cookie) => cookie.cookieName === "_ttp" || cookie.cookieName === "_tt_enable_cookie" || cookie.cookieName.startsWith("ttcsid"),
    severity: "high",
    title: "TikTok tracking cookie observed before consent"
  }
];

export function buildSignalFindings(input: {
  consentUi: ConsentUiSummary;
  cookiesBeforeConsent: CookieDetectionRecord[];
  fingerprinting: FingerprintingSummary;
  preConsentTimeline: PreConsentRequestRecord[];
  preConsentVendorSummary: PreConsentVendorSummary;
  vendorSummary: VendorSummary;
}) {
  const findings: SignalFinding[] = [];

  if (!input.consentUi.detected && (input.preConsentTimeline.length > 0 || input.cookiesBeforeConsent.length > 0)) {
    findings.push({
      category: "timeline",
      evidence: [
        `${input.preConsentTimeline.length} third-party request(s) observed before any consent UI was detected`,
        `${input.cookiesBeforeConsent.length} cookie(s) observed during passive pre-consent checkpoints`
      ],
      severity: "critical",
      title: "Pre-consent tracking observed before any consent UI was detected"
    });
  }

  for (const rule of COOKIE_RULES) {
    const matches = input.cookiesBeforeConsent.filter(rule.evidenceMatcher);
    if (matches.length === 0) {
      continue;
    }
    findings.push({
      category: rule.category,
      evidence: matches.map((cookie) => `${cookie.cookieName} @ ${cookie.cookieDomain ?? "unknown-domain"} (${cookie.firstSeenTimestampMs} ms)`),
      severity: rule.severity,
      title: rule.title
    });
  }

  if (input.fingerprinting.tier > 0) {
    findings.push({
      category: "timeline",
      evidence: input.fingerprinting.reasons.slice(0, 5),
      severity:
        input.fingerprinting.tier >= 3
          ? "high"
          : input.fingerprinting.tier >= 2
            ? "medium"
            : "low",
      title:
        input.fingerprinting.tier >= 3
          ? "Likely browser fingerprinting signals observed"
          : input.fingerprinting.tier >= 2
            ? "Potential browser fingerprinting signals observed"
            : "Suspicious anti-bot or fingerprint-related telemetry observed"
    });
  }

  const sortedVendors = Object.entries(input.preConsentVendorSummary.vendorCounts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  for (const [vendor, count] of sortedVendors.slice(0, 5)) {
    findings.push({
      category: "vendor",
      evidence: [`${vendor} (${count} matched requests)`],
      severity: count >= 10 ? "medium" : "low",
      title: `${vendor} observed in pre-consent/runtime vendor graph`
    });
  }

  return findings;
}
