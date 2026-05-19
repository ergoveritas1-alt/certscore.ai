export const DEFAULT_CERTSCORE_GPT_URL =
  "https://chatgpt.com/g/g-6a0cbbf2d9888191b9486207296a6c11-certscore-ai-website-privacy-scanner";

export function getCertScoreGptUrl() {
  return process.env.NEXT_PUBLIC_CERTSCORE_GPT_URL || DEFAULT_CERTSCORE_GPT_URL;
}
