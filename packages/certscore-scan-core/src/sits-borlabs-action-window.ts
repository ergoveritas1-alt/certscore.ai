import { createHash } from "node:crypto";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const homepage = hash("https://sits.com/");
const englishHomepage = hash("https://sits.com/en/");
const buttons = {
  accept: { selector: "button.brlbs-btn-accept-all", label: hash("Accept all") },
  reject: { selector: "button.brlbs-btn-accept-only-essential", label: hash("Accept essential cookies") },
};

// On the retained SITS visit the dialog bundle loaded at 8.57 s and live
// button verification finished at 11.81 s. The original eligibility decision
// still has six seconds to reach a prepared worker. Only its bound release
// gets this readiness window; normal live proof and click checks still apply.
export function sitsBorlabsActionWindowMs(action: keyof typeof buttons, selector: unknown, binding?: {
  requestedTargetSha256?: string; documentSha256?: string; labelSha256?: string;
  geometrySha256?: string; labelSource?: string;
}): number | undefined {
  const button = buttons[action];
  return binding?.geometrySha256 && !binding.labelSource &&
    (binding.requestedTargetSha256 === homepage || binding.requestedTargetSha256 === englishHomepage) &&
    binding.documentSha256 === englishHomepage && selector === button.selector && binding.labelSha256 === button.label
    ? 16_000 : undefined;
}
