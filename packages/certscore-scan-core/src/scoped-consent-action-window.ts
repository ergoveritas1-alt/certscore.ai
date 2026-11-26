import { createHash } from "node:crypto";

type Action = "accept" | "reject";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function verifiedControl(
  action: Action, requestedUrls: string[], documentUrl: string, selector: string, label: string, windowMs: number,
) {
  return { action, requestedTargets: requestedUrls.map(hash), document: hash(documentUrl), selector, label: hash(label), windowMs };
}

const slowControls = [
  // The original SITS visit verified its visible control at 11.81 s.
  verifiedControl("accept", ["https://sits.com/", "https://sits.com/en/"], "https://sits.com/en/",
    "button.brlbs-btn-accept-all", "Accept all", 16_000),
  verifiedControl("reject", ["https://sits.com/", "https://sits.com/en/"], "https://sits.com/en/",
    "button.brlbs-btn-accept-only-essential", "Accept essential cookies", 16_000),
  // Retained clicks at these exact controls were lost at the six-second cutoff.
  verifiedControl("accept", ["https://weedmaps.com/"], "https://weedmaps.com/",
    'button[data-testid="cookie-banner-accept"]', "Accept", 10_000),
  verifiedControl("reject", ["https://bendingspoons.com/"], "https://bendingspoons.com/",
    "button.banner-close-button", "Continue without accepting", 10_000),
  // Both original choices qualified; the coordinator dropped the workers at join.
  verifiedControl("accept", ["https://moneysupermarket.com/"], "https://www.moneysupermarket.com/",
    "#banner-accept", "Accept all", 10_000),
  verifiedControl("reject", ["https://moneysupermarket.com/"], "https://www.moneysupermarket.com/",
    "#banner-reject", "Reject all", 10_000),
  // The verified native Iubenda button arrived at the passive barrier.
  // The original coordinator cut off its action worker six seconds later.
  verifiedControl("accept", ["https://ilmattino.it/"], "https://www.ilmattino.it/",
    "button.iubenda-cs-accept-btn", "ACCETTA E CONTINUA", 10_000),
];

/** A longer release requires a fresh qualification tied to the exact retained
 * document, selector and label. All live recheck and action constraints apply. */
export function scopedConsentActionWindowMs(action: Action, selector: unknown, binding?: {
  requestedTargetSha256?: string; documentSha256?: string; labelSha256?: string;
  geometrySha256?: string; labelSource?: string;
}): number | undefined {
  if (!binding?.geometrySha256 || binding.labelSource || !binding.requestedTargetSha256) return;
  const requested = binding.requestedTargetSha256;
  return slowControls.find(control => control.action === action && control.selector === selector &&
    control.document === binding.documentSha256 && control.label === binding.labelSha256 &&
    control.requestedTargets.includes(requested))?.windowMs;
}
