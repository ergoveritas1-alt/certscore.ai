# Evidence JSON upstream capture follow-up

Date: 2026-07-08

This note tracks scanner-level capture fields that would make CertScore finding evidence JSON more self-auditing. It does not change production finding eligibility, scoring, report display, or scanner runtime behavior.

## Current WC01 action

WC01 Pulse evidence projection can expose bounded attribution diagnostics when retained evidence already contains enough request URL or host context:

- raw observed vendor/category
- canonical endpoint-resolved vendor/category
- attribution basis
- related or initiating vendor when the final projected vendor differs
- request provenance already present on retained rows, including resource type, frame URL, initiator URL/host/type, final URL, and bounded redirect chain
- cookie setter context already normalized by WC01, including initiator URL/domain/vendor, response URL, source request URL, and set method
- bounded projection warnings
- invalid display host/domain filtering diagnostics

## Upstream capture needed

Where not already available in WS01 or v2 scan artifacts, the following fields should be retained in typed, bounded runtime evidence contracts so WC01 can project them without inference:

- `initiatorUrl`, `initiatorHost`, and `initiatorType` for network requests
- `frameUrl` and frame role for iframe or nested CMP/request contexts
- `resourceType` for requests, such as script, image, stylesheet, fetch, xhr, document, or iframe
- bounded redirect chain and final request URL
- cookie setter context: cookie name, cookie domain, setter URL/host when known, and observed timestamp
- stable request/event ID that can connect request, response, cookie write, and vendor-resolution rows

## Retention rules

- Do not retain raw cookie values.
- Do not retain raw request or response bodies.
- Redact or bound URL query strings before public or agent-facing evidence JSON.
- Keep the raw scanner artifact richer than the public evidence packet only where access is internal and bounded by existing artifact-retention policy.

## Suggested contract shape

```ts
type RuntimeRequestProvenance = {
  requestId: string;
  requestUrl: string;
  urlHost: string;
  registrableDomain: string;
  finalUrl?: string;
  redirectChain?: string[];
  resourceType?: string;
  frameUrl?: string;
  initiatorType?: string;
  initiatorUrl?: string;
  initiatorHost?: string;
  firstSeenMs?: number;
};

type RuntimeCookieSetterContext = {
  cookieName: string;
  cookieDomain?: string;
  setterRequestId?: string;
  setterUrl?: string;
  setterHost?: string;
  observedAtMs?: number;
};
```

These fields should flow into WC01 only through typed observed evidence, normalized concern construction where relevant, concern policy, and unified finding/checklist projection. They should not create display-only findings.
