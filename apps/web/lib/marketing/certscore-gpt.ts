export const DEFAULT_CERTSCORE_GPT_URL =
  "https://chatgpt.com/g/g-6a123a39b0688191b41481fde1da54e3-gdpr-ccpa-consent-scanner-by-certscore-ai";

export function getCertScoreGptUrl() {
  return process.env.NEXT_PUBLIC_CERTSCORE_GPT_URL || DEFAULT_CERTSCORE_GPT_URL;
}
