export const DEFAULT_CERTSCORE_GPT_URL =
  "https://chatgpt.com/g/g-6a124a5a7ba08191b6cbe6d3ca03616b-gdpr-ccpa-consent-scanner-by-certscore-ai";

export function getCertScoreGptUrl() {
  return process.env.NEXT_PUBLIC_CERTSCORE_GPT_URL || DEFAULT_CERTSCORE_GPT_URL;
}
