# Fingerprint Confidence Tiering

WC01 interprets WS01 runtime evidence without moving fingerprinting interpretation into scanner collection. The scanner may continue sending retained primitives, vendors, requests, and summary fields; WC01 now derives an internal `fingerprintConfidenceTier` for report calibration.

## Tiers

- Tier 0: generic browser telemetry only, such as viewport, timezone, locale, storage, touch, or network state.
- Tier 1: elevated browser/device entropy collection, such as hardware concurrency, device memory, WebGL presence, canvas reads alone, or audio context alone.
- Tier 2: fingerprinting-related browser telemetry, such as coordinated high-entropy primitives, canvas plus fonts, canvas plus audio, WebGL extraction, plugin/font enumeration, or repeated entropy reads.
- Tier 3: probable identity-oriented fingerprinting. Requires corroboration such as identifier linkage, known fingerprinting vendor attribution, outbound entropy transmission, repeat collection sequencing, cookie-sync linkage, cross-context identifier behavior, or known fingerprint SDK/script attribution.

Tier 1 and Tier 2 report language includes the limitations that these signals may also appear in fraud prevention, performance optimization, or advanced analytics contexts, and that browser entropy collection alone does not establish cross-site identity tracking.

## Added Evidence Fields

Existing fields remain valid and should continue to be retained:

- `strongFingerprintSignals`
- `genericFingerprintSignals`
- `confidenceExplanation`
- `evidencePreview`

New WC01-derived evidence dimensions:

- `entropyTransmissionObserved`
- `entropyLinkedToIdentifier`
- `crossContextLinkageObserved`
- `fingerprintConfidenceTier`
- `fingerprintConfidenceTierLabel`
- `knownFingerprintingVendorObserved`

## Before

```json
{
  "finding_id": "probable_fingerprinting",
  "label": "Probable fingerprinting behavior",
  "evidenceDetails": {
    "telemetryEvidence": {
      "identifierLikeRequestCount": 0,
      "deviceDataLikeRequestCount": 0,
      "strongFingerprintSignals": ["canvas_webgl", "audio", "fonts_plugins", "hardware"],
      "genericFingerprintSignals": ["timezone_locale", "storage"],
      "confidenceExplanation": "Multiple high-entropy browser/device collection primitives observed."
    }
  }
}
```

## After: Tier 2 Without Linkage

```json
{
  "finding_id": "browser_fingerprinting_related_signals_observed",
  "label": "Browser fingerprinting-related signals observed",
  "severity": "medium",
  "evidenceDetails": {
    "telemetryEvidence": {
      "identifierLikeRequestCount": 0,
      "deviceDataLikeRequestCount": 0,
      "strongFingerprintSignals": ["canvas_webgl", "audio", "fonts_plugins", "hardware"],
      "genericFingerprintSignals": ["timezone_locale", "storage"],
      "fingerprintConfidenceTier": 2,
      "fingerprintConfidenceTierLabel": "Fingerprinting-related browser telemetry observed",
      "entropyTransmissionObserved": false,
      "entropyLinkedToIdentifier": false,
      "crossContextLinkageObserved": false,
      "knownFingerprintingVendorObserved": false,
      "confidenceExplanation": "Coordinated high-entropy browser/device collection was observed, but retained evidence does not establish identity-oriented fingerprinting."
    }
  }
}
```

## After: Tier 3 With Linkage

```json
{
  "finding_id": "probable_fingerprinting",
  "label": "Probable fingerprinting behavior",
  "severity": "high",
  "evidenceDetails": {
    "telemetryEvidence": {
      "identifierLikeRequestCount": 1,
      "deviceDataLikeRequestCount": 1,
      "strongFingerprintSignals": ["canvas_webgl", "fonts_plugins"],
      "fingerprintConfidenceTier": 3,
      "fingerprintConfidenceTierLabel": "Probable fingerprinting behavior",
      "entropyTransmissionObserved": true,
      "entropyLinkedToIdentifier": true,
      "crossContextLinkageObserved": false,
      "knownFingerprintingVendorObserved": false,
      "confidenceExplanation": "High-entropy browser/device collection is corroborated by identifier linkage, outbound entropy transmission, known fingerprinting vendor attribution, repeat sequencing, or cross-context linkage."
    }
  }
}
```
