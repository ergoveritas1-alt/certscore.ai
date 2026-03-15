const CONSENT_ACCEPT_PATTERNS = [
  /accept/,
  /allow all/,
  /agree/,
  /\bok\b/,
  /\bokay\b/,
  /got it/,
  /i understand/
];

const CONSENT_REJECT_PATTERNS = [
  /reject/,
  /decline/,
  /deny/,
  /refuse/,
  /disallow/,
  /only necessary/,
  /necessary only/,
  /essential only/,
  /continue without accepting/,
  /continue without consent/
];

const CONSENT_PREFERENCES_PATTERNS = [
  /preferences/,
  /settings/,
  /manage/,
  /customi[sz]e/,
  /privacy choices/,
  /cookie choices/,
  /more choices/,
  /learn more/
];

const CONSENT_DISMISS_PATTERNS = [/close/, /dismiss/, /not now/];

export function classifyConsentButtonRole(text: string): "accept" | "reject" | "preferences" | "dismiss" | "unknown" {
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (CONSENT_REJECT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "reject";
  }

  if (CONSENT_PREFERENCES_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "preferences";
  }

  if (CONSENT_ACCEPT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "accept";
  }

  if (CONSENT_DISMISS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "dismiss";
  }

  return "unknown";
}
