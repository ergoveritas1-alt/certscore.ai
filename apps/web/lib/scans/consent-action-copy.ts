/** Copy for the already-eligible canonical finding; never an eligibility rule. */
export const REJECT_CLICK_TRACKING_COPY = {
  label: "Non-essential cookies or services after Reject click",
  description: "Classified non-essential cookies or service requests were observed after the Reject control was clicked. Review the retained evidence to distinguish cookie presence, storage writes and network activity. Choice registration is reported separately.",
  whyItMatters: "Non-essential evidence after a Reject click warrants review of the site's consent implementation; cookie presence alone does not establish active use or confirmed refusal.",
} as const;
