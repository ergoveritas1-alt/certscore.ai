import type { BlockClassifierInput, EgressRiskObservation } from "./access-limitations";

export const blockPageFixtures: Record<string, BlockClassifierInput> = {
  plain403OriginBlock: {
    title: "403 Forbidden",
    normalizedTextExcerpt: "Access denied.",
    contentLength: 96,
    serverHeader: "nginx"
  },
  akamaiInterstitial: {
    title: "Access Denied",
    normalizedTextExcerpt: "Reference #18.5c4f123. request could not be satisfied. akamai",
    contentLength: 320,
    serverHeader: "AkamaiGHost"
  },
  cloudflareChallenge: {
    title: "Just a moment...",
    normalizedTextExcerpt: "Checking your browser before accessing this site. Enable JavaScript and cookies to continue.",
    headers: {
      "cf-ray": "12345",
      server: "cloudflare"
    }
  },
  loginAuthWall: {
    title: "Sign in required",
    normalizedTextExcerpt: "Please log in to continue to this page.",
    contentLength: 180
  },
  passiveVerificationSuccessAfterHomepageBlock: {
    title: "403 Forbidden",
    normalizedTextExcerpt: "Access denied at homepage, but public policy pages remained reachable.",
    contentLength: 140
  }
};

export const egressRiskFixtures: Record<string, EgressRiskObservation> = {
  repeated403ClusterTriggeringHighBlockRiskMode: {
    blockedHomepage403DistinctDomainsLastHour: 5
  }
};
