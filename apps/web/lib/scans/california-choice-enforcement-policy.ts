export const CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY = "california.choice_enforcement.recipients";
export const CALIFORNIA_CHOICE_ENFORCEMENT_TOTALS = [0, 15, 25, 32, 37, 40, 43, 45, 47] as const;
export type CaliforniaChoiceEnforcementPoints = typeof CALIFORNIA_CHOICE_ENFORCEMENT_TOTALS[number];

/** One family total: the initial effect includes the first recipient and any
 * verified choice contradiction. Unknown identities cannot create increments. */
export function californiaChoiceEnforcementPoints(recipientIds: readonly string[], supportedConcern: boolean): CaliforniaChoiceEnforcementPoints {
  const count = Math.max(new Set(recipientIds).size, supportedConcern ? 1 : 0);
  return CALIFORNIA_CHOICE_ENFORCEMENT_TOTALS[Math.min(8, count)]!;
}

