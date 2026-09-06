import { afterClickSummary } from "../after-action-summary";

export function acceptAfterClickSummary(projection: Record<string, unknown>): string {
  return afterClickSummary(projection, "accept");
}
/** Translate only retained action outcomes; missing diagnostics remain unknown. */
export function acceptPathIncompleteReason(projection: Record<string, unknown>): string {
  const resolver = projection.resolver as { reason?: string } | undefined;
  const diagnostics = projection.interactionDiagnostics as { click?: { outcome?: string } } | undefined;
  const duration = typeof projection.resolverDurationMs === "number" && Number.isFinite(projection.resolverDurationMs)
    ? ` within ${(projection.resolverDurationMs / 1_000).toFixed(2)} seconds` : "";
  if (resolver?.reason === "deterministic_accept_control_not_found") {
    return `No actionable Accept control was found${duration}. No click was attempted.`;
  }
  if (resolver?.reason === "multiple_deterministic_accept_controls_found") {
    return "More than one possible Accept control was found. No click was attempted because the target was ambiguous.";
  }
  if (diagnostics?.click?.outcome === "completed" || (projection.afterActionCapture as { activationStatus?: string } | undefined)?.activationStatus === "completed") {
    return "The Accept control was clicked, but granted consent could not be verified." + acceptAfterClickSummary(projection);
  }
  if (diagnostics?.click?.outcome === "failed_before_dispatch") return "The Accept control was found, but the click could not be dispatched.";
  if (diagnostics?.click?.outcome === "failed_after_dispatch") return "An Accept click was dispatched, but its completion and granted consent could not be verified.";
  if (projection.registrationStatus === "not_attempted") return "No Accept click was attempted. The retained result does not include the specific discovery reason.";
  if (projection.registrationStatus === "aborted") return "Accept testing stopped before a verified result was retained.";
  if (projection.registrationStatus === "unsupported") return "The observed consent control could not be exercised by the available action recipes.";
  if (projection.limitationCode === "accept_path_worker_failed") return "The Accept observation worker failed before a verified result could be retained.";
  if (projection.limitationCode === "accept_observation_window_truncated") return "The post-Accept observation window ended early, leaving incomplete coverage.";
  return "Accept testing did not retain enough evidence to verify that consent was granted.";
}
