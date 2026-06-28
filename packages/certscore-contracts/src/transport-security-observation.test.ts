import assert from "node:assert/strict";
import test from "node:test";
import { transportSecurityObservationSchema } from "./index.js";

test("transportSecurityObservationSchema accepts bounded redacted transport evidence", () => {
  const parsed = transportSecurityObservationSchema.parse({
    observationId: "transport_security_pre_consent",
    observedAtMs: 1200,
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    requestedUrl: "https://example.com/",
    normalizedUrl: "https://example.com/",
    requestedScheme: "https",
    finalUrl: "https://example.com/",
    finalScheme: "https",
    sampledPageUrls: ["https://example.com/"],
    pageHttpsObserved: true,
    httpProbe: {
      attempted: true,
      inputUrl: "http://example.com/",
      status: 200,
      finalUrl: "https://example.com/",
      finalScheme: "https",
      redirectChain: ["http://example.com/", "https://example.com/"],
      redirectedToHttps: true,
    },
    tlsProbe: {
      attempted: true,
      inputUrl: "https://example.com/",
      validCertificate: true,
      finalUrl: "https://example.com/",
    },
    mixedContent: {
      loadedHttpSubresources: [{
        disposition: "loaded",
        evidenceSource: "network_request",
        hostname: "cdn.example.net",
        pageUrl: "https://example.com/",
        resourceType: "script",
        url: "http://cdn.example.net/script.js",
      }],
      blockedHttpSubresources: [],
      observedCount: 1,
    },
    formTransports: [{
      formId: "form_0",
      pageUrl: "https://example.com/contact",
      pageScheme: "https",
      method: "post",
      actionPresent: true,
      actionUrl: "http://example.com/submit",
      actionScheme: "http",
      resolvesToHttps: false,
      insecureTransportObserved: true,
      fieldTypes: ["email"],
      hasEmailField: true,
      hasSensitiveFieldHint: false,
    }],
    summary: {
      scannedPagesUseHttps: true,
      validTlsCertificate: true,
      httpRedirectsToHttps: true,
      mixedContentObserved: true,
      insecureFormTransportObserved: true,
    },
    evidenceRefs: [{ refId: "ref_transport_security", artifactId: "transport_security_observation" }],
    confidence: 0.94,
    directVsInferred: "direct",
  });

  assert.equal(parsed.summary.httpRedirectsToHttps, true);
  assert.equal(parsed.mixedContent.observedCount, 1);
  assert.equal(parsed.formTransports[0]?.insecureTransportObserved, true);
});
