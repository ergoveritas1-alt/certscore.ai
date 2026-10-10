/** Display only the reason retained by canonical form capture. Legacy records
 * have no reason; never infer one from the form or other screenshots. */
export function formSnapshotExplanation(reason?: string): string {
  const messages: Record<string, string> = {
    capture_cancelled: "Capture was interrupted.",
    capture_budget_exhausted: "The capture time limit was reached.",
    document_changed: "The page changed before capture completed.",
    control_identity_unavailable: "The form could not be bound to its retained fields.",
    control_binding_changed: "The retained fields no longer matched the live form.",
    form_not_visible: "The form was no longer visible for capture.",
    form_bounds_exceeded: "The form exceeded the image capture limits.",
    screenshot_failed: "The browser could not capture the form image.",
    image_processing_failed: "The captured image could not be processed.",
    image_size_exceeded: "The image exceeded the retained size limit.",
    no_visible_context: "No visible form detail remained in the masked image.",
    review_failed: "Image safety review could not complete.",
    review_timed_out: "Image safety review reached its time limit.",
    review_withheld: "The image was withheld by safety review.",
  };
  return reason && Object.hasOwn(messages, reason) ? messages[reason]! : "Reason not recorded for this scan.";
}
