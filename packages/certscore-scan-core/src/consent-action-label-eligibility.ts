import {classifyConsentControlLabel} from "@certscore/contracts";

/** Preflight only for a generic geometry recipe after candidate uniqueness.
 * Observation recognition is not an action grant. Named contextual recipes
 * retain their independent scope proof; final live-label proof still runs. */
export function genericConsentActionLabelSupported(label: string, action: "accept" | "reject"): boolean {
  const result=classifyConsentControlLabel({label,usage:"action",classifierProfile:"multilingual_v1",hasConsentContext:true});
  return result.intent===action && result.confidence>=0.8 && result.matchedLocale!=="mk";
}
