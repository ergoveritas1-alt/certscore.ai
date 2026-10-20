/** Repair instructions for an already-retained automated rule result.
 * These never classify a node, create a finding or establish conformance.
 * References checked against W3C WAI guidance on 2026-10-20.
 */
export function accessibilityCorrectionGuidance(ruleId: string): { steps: string[]; reference: string } | null {
  switch (ruleId) {
    case "image-alt": return {
      steps: [
        'In the image component, add an alt attribute that conveys the image\'s purpose. Use alt="" only for a purely decorative or redundant image.',
        "For an image acting as a link or button, describe the destination or action. Review the image in its page context before choosing the wording.",
      ],
      reference: "https://www.w3.org/WAI/tutorials/images/decision-tree/",
    };
    case "label": return {
      steps: [
        "Add a visible label and connect its for attribute to the input's unique id, or use a correctly associated wrapping label.",
        "If existing text supplies the label, associate it with aria-labelledby. Check that repeated components generate unique IDs and that the control has a useful accessible name.",
      ],
      reference: "https://www.w3.org/WAI/tutorials/forms/labels/",
    };
    case "button-name": return {
      steps: [
        "Give the button a meaningful accessible name through its visible text, aria-labelledby or aria-label. Use wording that describes its action.",
        "Check the browser accessibility tree, then verify keyboard focus and activation. Confirm the name and any state remain meaningful as the component changes.",
      ],
      reference: "https://www.w3.org/WAI/ARIA/apg/patterns/button/",
    };
    case "color-contrast": return {
      steps: [
        "Update the foreground/background color pair in the component's CSS or design token. Use the measured and required ratios in the retained evidence to identify the failing pair.",
        "Measure the rendered text against its actual background after the change, including gradients, opacity and relevant UI states. Verify the applicable text-size threshold.",
      ],
      reference: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
    };
    default: return null;
  }
}
