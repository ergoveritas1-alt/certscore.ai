/** Translate known execution failures without exposing internal error payloads. */
export function scanFailureExplanation(error: string | null | undefined) {
  if (/ECONNREFUSED\s+(?:127\.0\.0\.1|localhost):9000\b/i.test(error ?? "")) {
    return {
      title: "Evidence storage was unavailable",
      detail: "The scan could not connect to local evidence storage, so it could not save the captured results. This is a scanner setup issue, not a problem found on the website.",
      nextStep: "Local evidence storage must be running before starting a new scan. This failed run will not resume automatically.",
    };
  }
  return {
    title: "The scan could not finish",
    detail: "The scanner stopped before it could produce a completed report. Earlier completed reports are still available.",
    nextStep: "Start a new scan. If it fails again, contact support with the scan reference below.",
  };
}
