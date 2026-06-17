export const DEFAULT_CERTSCORE_GPT_URL =
  // ChatGPT direct /g/... deep links can boot to a blank page in new cross-site tabs; the GPTs search entry hydrates reliably.
  "https://chatgpt.com/gpts?search=GDPR%20ePrivacy%20Cookie%20Consent%20Privacy%20Scanner";

export function getCertScoreGptUrl() {
  return process.env.NEXT_PUBLIC_CERTSCORE_GPT_URL || DEFAULT_CERTSCORE_GPT_URL;
}
