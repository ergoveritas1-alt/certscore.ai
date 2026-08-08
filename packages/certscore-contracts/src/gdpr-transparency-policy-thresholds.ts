// A complete, target-owned policy can support row-specific positive evidence
// at this size when the canonical classifier retains a direct passage.
export const MIN_GDPR_TRANSPARENCY_POLICY_TEXT_CHARS = 500;

// Absence conclusions require broader policy coverage than positive evidence.
// Keep this stricter gate so lowering the evaluation threshold cannot turn a
// short policy's silence into a GDPR Transparency gap.
export const MIN_GDPR_TRANSPARENCY_ABSENCE_POLICY_TEXT_CHARS = 2_500;
