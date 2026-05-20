const REGULATORY_LENS_ANCHOR_BY_NAME = new Map<string, string>([
  ["ccpa / cpra / cipa", "review-lens-ccpa-cpra-cipa"],
  ["gdpr / eprivacy", "review-lens-gdpr-eprivacy"],
  ["ftc", "review-lens-ftc"],
  ["doj / ada accessibility", "review-lens-doj-ada-accessibility"],
  ["doj / ada", "review-lens-doj-ada-accessibility"],
  ["financial & commercial claims", "review-lens-financial-commercial-claims"]
]);

export function getRegulatoryLensAnchor(lensName: string) {
  const normalized = lensName.trim().toLowerCase();
  const mapped = REGULATORY_LENS_ANCHOR_BY_NAME.get(normalized);
  if (mapped) {
    return mapped;
  }

  const slug = normalized
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `review-lens-${slug}` : "review-lens";
}
