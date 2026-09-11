/** Copy for the already-eligible canonical finding; never an eligibility rule. */
export const REJECT_CLICK_TRACKING_COPY = {
  label: "Tracking observed after Reject",
  description: "Tracking requests started after the Reject control was clicked. The retained requests identify the services contacted and when the activity began.",
  whyItMatters: "Tracking activity following a visitor's Reject action identifies requests to investigate in the site's consent implementation.",
} as const;
