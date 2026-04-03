import assert from "node:assert/strict";
import test from "node:test";
import { collectResolvedRuntimeVendors, collectVendorEnrichmentCandidates } from "./vendor-enrichment";

test("collectVendorEnrichmentCandidates gathers unresolved request, cookie, and cname hosts", () => {
  const candidates = collectVendorEnrichmentCandidates({
    requestedHostname: "example.com",
    runtimeArtifacts: {
      domainVendorRegistry: [
        {
          endpointHostname: "logs.example-cdn.net",
          sampleUrls: ["https://logs.example-cdn.net/log"],
          vendorName: null
        }
      ],
      hybrid_runtime_evidence: {
        requestToVendorObservations: [
          {
            hostname: "pixel.tapad.com",
            preConsent: true,
            vendor: "unresolved"
          }
        ],
        cookieWriteObservations: [
          {
            beforeConsent: false,
            cookieName: "_ttp",
            cookiePartyType: "third_party",
            domain: ".tiktok.com"
          }
        ],
        cnameCandidates: [
          {
            sampleUrls: ["https://logs.example.com/log"],
            subdomain: "logs.example.com"
          }
        ]
      }
    },
    snapshot: {
      third_party_cookie_set_before_consent: true
    }
  });

  const byHost = new Map(candidates.map((candidate) => [candidate.hostname, candidate]));
  assert.ok(byHost.has("pixel.tapad.com"));
  assert.ok(byHost.has("tiktok.com"));
  assert.ok(byHost.has("logs.example-cdn.net"));
  assert.ok(byHost.has("logs.example.com"));
  assert.equal(byHost.get("pixel.tapad.com")?.beforeConsent, true);
  assert.deepEqual(byHost.get("tiktok.com")?.cookieNames, ["_ttp"]);
  assert.equal(byHost.get("tiktok.com")?.beforeConsent, true);
});

test("collectVendorEnrichmentCandidates normalizes known static-match hosts for downstream enrichment", () => {
  const candidates = collectVendorEnrichmentCandidates({
    requestedHostname: "netflix.com",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        cookieWriteObservations: [
          {
            beforeConsent: true,
            cookieName: "sc_at",
            cookiePartyType: "third_party",
            domain: ".snapchat.com"
          },
          {
            beforeConsent: true,
            cookieName: "_ttp",
            cookiePartyType: "third_party",
            domain: ".tiktok.com"
          }
        ],
        cnameCandidates: [
          {
            subdomain: "logs.netflix.com"
          },
          {
            subdomain: "web.prod.cloud.netflix.com"
          }
        ]
      }
    },
    snapshot: {
      third_party_cookie_set_before_consent: true,
      tracking_before_consent_detected: true
    }
  });

  const hosts = candidates.map((candidate) => candidate.hostname).sort();
  assert.deepEqual(hosts, ["logs.netflix.com", "snapchat.com", "tiktok.com", "web.prod.cloud.netflix.com"]);
});

test("collectResolvedRuntimeVendors keeps direct replay vendor observations for persistence", () => {
  const vendors = collectResolvedRuntimeVendors({
    requestedHostname: "kbdlab.io",
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        requestToVendorObservations: [
          {
            hostname: "www.clarity.ms",
            category: "session_replay",
            confidence: "high",
            preConsent: true,
            vendor: "Microsoft Clarity",
            evidenceSource: "signature"
          },
          {
            hostname: "scripts.clarity.ms",
            category: "session_replay",
            confidence: "high",
            preConsent: true,
            vendor: "Microsoft Clarity",
            evidenceSource: "signature"
          }
        ]
      }
    }
  });

  assert.equal(vendors.length, 2);
  assert.deepEqual(
    vendors.map((vendor) => vendor.vendorName),
    ["Microsoft Clarity", "Microsoft Clarity"]
  );
  assert.ok(vendors.every((vendor) => vendor.vendorCategory === "session_replay"));
  assert.ok(vendors.every((vendor) => vendor.beforeConsent === true));
});
