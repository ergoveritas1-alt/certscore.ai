export type TrackerVendorObservationIdentityInput = {
  detectionSource: string;
  matchedSignatureId: string | null;
  scriptHost: string | null;
  vendorName: string;
};

export function buildTrackerVendorObservationIdentityKey(
  tracker: TrackerVendorObservationIdentityInput
) {
  return [
    tracker.vendorName,
    tracker.detectionSource,
    tracker.scriptHost ?? "",
    tracker.matchedSignatureId ?? "no-retained-signature",
  ].join("\u0000");
}
