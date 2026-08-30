import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type StaticFixturePage =
  | "akamai-security-cookie"
  | "clarity-collection"
  | "clarity-f-collection"
  | "cmp-cookie"
  | "demdex-id"
  | "embedded-third-party-iframe"
  | "fingerprinting-api-probe"
  | "consent-accept-only-activation"
  | "consent-analytics-cookie-persists"
  | "consent-ambiguous-controls"
  | "consent-accept-essential"
  | "consent-banner-failed-click"
  | "consent-banner-stateful-click"
  | "consent-cmp-cookie-persists"
  | "consent-cmp-network-late-controls"
  | "consent-cmp-script-offscreen-context-controls"
  | "consent-cmp-script-offscreen-footer-settings"
  | "consent-cmp-script-late-settings"
  | "consent-cmp-script-offscreen-onetrust-controls"
  | "consent-cmp-script-shadow-context-controls"
  | "consent-cmp-script-staggered-controls"
  | "consent-cmp-script-supplemental-settings"
  | "consent-cmp-static-canonical-controls"
  | "consent-cmp-script-very-late-settings"
  | "consent-compact-analytics-controls"
  | "consent-compact-cookie-controls"
  | "consent-compact-privacy-settings-controls"
  | "consent-contextual-approval-offscreen"
  | "consent-dismiss-only"
  | "consent-contextual-continue-accept"
  | "consent-deny-non-essential"
  | "consent-generic-learn-more-page-context"
  | "consent-first-layer-necessary-toggle-only"
  | "consent-first-layer-optional-toggle-off"
  | "consent-first-layer-optional-toggle-on"
  | "consent-first-layer-internal-scroll-defaults-off"
  | "consent-analytics-category-controls"
  | "consent-iframe-reject"
  | "consent-lean-guarded-image-cookie"
  | "consent-localized-controls"
  | "consent-spanish-inflected-controls"
  | "consent-slovenian-load-controls"
  | "consent-navigation-timeout"
  | "consent-focused-privacy-opt-out"
  | "consent-manage-preferences"
  | "consent-no-reject"
  | "consent-late-first-layer-controls"
  | "consent-late-first-layer-choice-controls"
  | "consent-late-without-cmp-runtime"
  | "consent-late-cmp-choice-controls"
  | "consent-late-ketch-portuguese-controls"
  | "consent-renderer-contention-delayed-controls"
  | "consent-transparent-input-overlays"
  | "consent-privacy-choice-surface-reject-success"
  | "consent-privacy-choice-only"
  | "consent-privacy-opt-out-ad-comparison"
  | "consent-privacy-opt-out-radio-form-ad-comparison"
  | "consent-preference-center-ambiguous"
  | "consent-preference-center-confirm-save"
  | "consent-post-choice-reopen-control"
  | "consent-preference-center-reject-success"
  | "consent-preference-center-toggle-save"
  | "consent-reject-subscribe"
  | "consent-reject-pay"
  | "consent-required-only"
  | "consent-simple-accept-reject"
  | "consent-sits-style-preferences"
  | "consent-tracking-persists-after-reject"
  | "post-refusal-reject-honored"
  | "post-refusal-reject-handler-after-dom-ready"
  | "post-refusal-certscore-owned-analytics"
  | "post-refusal-reject-observation-long-task"
  | "post-refusal-reject-action-phase-nonessential"
  | "post-refusal-reject-ignored"
  | "post-refusal-reject-missing"
  | "post-refusal-reject-persistence-only"
  | "post-refusal-reject-unconfirmed"
  | "post-refusal-reject-inflight"
  | "post-refusal-reject-inflight-redirect-flood"
  | "post-refusal-reject-click-fails"
  | "post-refusal-reject-click-confirmed-after-error"
  | "post-refusal-reject-reresolved-before-click"
  | "post-refusal-reject-stale-storage"
  | "post-refusal-reject-request-flood"
  | "post-refusal-reject-storage-write-flood"
  | "post-refusal-reject-bing-uet-write"
  | "post-refusal-reject-adobe-consent-propagation"
  | "post-refusal-reject-lowercase-fs-site-state"
  | "post-refusal-reject-server-cookie"
  | "post-refusal-reject-third-party-cookie"
  | "post-refusal-onetrust-tcf-honored"
  | "post-refusal-onetrust-tcf-ignored"
  | "post-refusal-onetrust-no-reject"
  | "post-refusal-onetrust-tcf-contradiction"
  | "post-refusal-onetrust-tcf-stale"
  | "post-refusal-onetrust-tcf-delayed-contradiction"
  | "post-refusal-onetrust-tcf-storage-unavailable"
  | "post-refusal-onetrust-cookie-confirmed"
  | "post-refusal-onetrust-continue-without-accepting"
  | "post-refusal-onetrust-cookie-navigation"
  | "post-refusal-onetrust-cookie-stale"
  | "post-refusal-cookiebot-fast"
  | "post-refusal-cookiebot-level-optin-decline-all"
  | "post-refusal-cookiebot-cookie-stale"
  | "post-refusal-usercentrics-delayed"
  | "post-refusal-usercentrics-legacy-deny"
  | "post-refusal-usercentrics-storage-stale"
  | "post-refusal-canonical-cmp-ambiguous"
  | "ga-collection"
  | "ga-first-party-vendor-associated-cookie"
  | "generic-bare-choice-controls"
  | "generic-cdn-noise"
  | "google-ads-measurement"
  | "google-doubleclick-pixel"
  | "google-consent-tag-support"
  | "google-owned-unresolved"
  | "gtm-library-only"
  | "newrelic-performance-monitoring"
  | "policy-ai-disclosure"
  | "policy-article13-long"
  | "policy-article13-accordions"
  | "policy-international-transfer-recipient-safeguards"
  | "policy-ambiguous-choices"
  | "policy-broken-link"
  | "policy-browser-hydrated-document"
  | "policy-loading-notice-template-shell"
  | "policy-canonical-near-privacy-center"
  | "policy-redirected-privacy-center"
  | "policy-localized-canonical-shell"
  | "policy-client-challenge"
  | "policy-french-captcha-challenge"
  | "policy-cookie-link"
  | "policy-do-not-sell-link"
  | "policy-footer-privacy-delayed"
  | "policy-global-footer-delayed"
  | "policy-gold-caltech-common-path"
  | "policy-gold-ford-secondary-only"
  | "policy-gold-ikea-common-path"
  | "policy-gold-latimes-secondary-only"
  | "policy-gold-nvidia-secondary-only"
  | "policy-gold-privacy-duplicates"
  | "policy-external-choice-platform"
  | "policy-footer-privacy"
  | "policy-google-script-noise"
  | "policy-google-script-only"
  | "policy-google-like-late-sections"
  | "policy-jsonld-article-body"
  | "policy-homepage-external-url-only-policy-links"
  | "policy-gdpr-transparency-diagnostic-negatives"
  | "policy-gdpr-transparency-encoded-it"
  | "policy-gdpr-transparency-compact-nl"
  | "policy-gdpr-transparency-latin1-es"
  | "policy-gdpr-transparency-pdf-nl"
  | "policy-gdpr-transparency-long-wave-one"
  | "policy-gdpr-transparency-long-wave-two"
  | "policy-gdpr-transparency-long-wave-three"
  | "policy-gdpr-transparency-long-wave-four"
  | "policy-gdpr-transparency-long-wave-five"
  | "policy-gpc-disclosure-late"
  | "policy-gpc-disclosure"
  | "policy-generic-links"
  | "policy-link-aria-title"
  | "policy-large-homepage-legal-footer"
  | "policy-large-homepage-middle-legal-footer"
  | "policy-late-gdpr-sections"
  | "policy-latimes-footer-surfaces"
  | "policy-localized-privacy-supplement"
  | "policy-mature-real-prose"
  | "policy-medal-rendered-privacy"
  | "policy-multilingual-article13-topics"
  | "policy-multilingual-surfaces"
  | "policy-late-rendered-pl-privacy-links"
  | "policy-neighboring-footer-privacy-noise"
  | "policy-powered-by-attribution"
  | "policy-secondary-third-party-links"
  | "policy-onetrust-index-json"
  | "policy-onetrust-notice-json"
  | "policy-privacy-document-index"
  | "policy-lancaster-style-privacy-index"
  | "policy-privacy-center-link"
  | "policy-rendered-article13-better"
  | "policy-rendered-incomplete-substantive"
  | "policy-retention-rights-only"
  | "policy-state-privacy-rights-link"
  | "policy-cmp-preference-control"
  | "policy-manage-cookies-footer-control"
  | "policy-manage-cookies-footer-anchor"
  | "policy-manage-cookies-embedded-config"
  | "policy-no-links"
  | "policy-no-links-pt"
  | "policy-no-links-es"
  | "policy-noisy-policy-body"
  | "policy-notice-at-collection-link"
  | "policy-privacy-choices-link"
  | "policy-static-core-surfaces"
  | "policy-static-legacy-plus-rendered-canonical"
  | "policy-url-stub-canonical"
  | "policy-session-replay-disclosure"
  | "policy-vendor-mentions"
  | "policy-webmd-like-secondary-surfaces"
  | "region-coded-collection-endpoint"
  | "security-access-temporarily-restricted"
  | "security-background-challenge-normal-site"
  | "security-cloudflare-challenge"
  | "security-datadome-challenge"
  | "security-kasada-challenge"
  | "security-polish-temporary-interstitial"
  | "no-go-blank-page"
  | "no-go-cloudflare-dns-error"
  | "no-go-branded-technical-error"
  | "no-go-confirmed-sparse-shell"
  | "no-go-configuration-error"
  | "no-go-loading-stalled"
  | "no-go-minimal-not-found"
  | "no-go-not-found"
  | "no-go-placeholder"
  | "no-go-real-world-access-shells"
  | "no-go-site-not-ready"
  | "no-go-technical-placeholder"
  | "no-go-unsupported-region"
  | "branded-login-page"
  | "site-owned-infrastructure"
  | "third-party-cookie-positive"
  | "unresolved-collection-endpoint";

export interface StaticFixtureServer {
  baseUrl: string;
  urlFor(page: StaticFixturePage): string;
  requestCountFor(pathname: string): number;
  close(): Promise<void>;
}

const fixtureSlugs: Record<StaticFixturePage, string> = {
  "akamai-security-cookie": "ak-security",
  "clarity-collection": "clarity-page",
  "clarity-f-collection": "clarity-f-page",
  "cmp-cookie": "consent-cookie",
  "demdex-id": "demdex-id",
  "embedded-third-party-iframe": "embedded-third-party-iframe",
  "fingerprinting-api-probe": "fingerprinting-api-probe",
  "consent-accept-only-activation": "consent-accept-only",
  "consent-analytics-cookie-persists": "consent-analytics-cookie-persists",
  "consent-ambiguous-controls": "consent-ambiguous-controls",
  "consent-accept-essential": "consent-accept-essential",
  "consent-banner-failed-click": "consent-failed-click",
  "consent-banner-stateful-click": "consent-stateful-click",
  "consent-cmp-cookie-persists": "consent-cmp-cookie-persists",
  "consent-cmp-network-late-controls": "consent-cmp-network-late-controls",
  "consent-cmp-script-offscreen-context-controls": "consent-cmp-script-offscreen-context-controls",
  "consent-cmp-script-offscreen-footer-settings": "consent-cmp-script-offscreen-footer-settings",
  "consent-cmp-script-late-settings": "consent-cmp-script-late-settings",
  "consent-cmp-script-offscreen-onetrust-controls": "consent-cmp-script-offscreen-onetrust-controls",
  "consent-cmp-script-shadow-context-controls": "consent-cmp-script-shadow-context-controls",
  "consent-cmp-script-staggered-controls": "consent-cmp-script-staggered-controls",
  "consent-cmp-script-supplemental-settings": "consent-cmp-script-supplemental-settings",
  "consent-cmp-static-canonical-controls": "consent-cmp-static-canonical-controls",
  "consent-cmp-script-very-late-settings": "consent-cmp-script-very-late-settings",
  "consent-compact-analytics-controls": "consent-compact-analytics-controls",
  "consent-compact-cookie-controls": "consent-compact-cookie-controls",
  "consent-compact-privacy-settings-controls": "consent-compact-privacy-settings-controls",
  "consent-contextual-approval-offscreen": "consent-contextual-approval-offscreen",
  "consent-dismiss-only": "consent-dismiss-only",
  "consent-contextual-continue-accept": "consent-contextual-continue-accept",
  "consent-deny-non-essential": "consent-deny-non-essential",
  "consent-generic-learn-more-page-context": "consent-generic-learn-more-page-context",
  "consent-first-layer-necessary-toggle-only": "consent-first-layer-necessary-toggle-only",
  "consent-first-layer-optional-toggle-off": "consent-first-layer-optional-toggle-off",
  "consent-first-layer-optional-toggle-on": "consent-first-layer-optional-toggle-on",
  "consent-first-layer-internal-scroll-defaults-off": "consent-first-layer-internal-scroll-defaults-off",
  "consent-analytics-category-controls": "consent-analytics-category-controls",
  "consent-iframe-reject": "consent-iframe-reject",
  "consent-lean-guarded-image-cookie": "consent-lean-guarded-image-cookie",
  "consent-localized-controls": "consent-localized-controls",
  "consent-spanish-inflected-controls": "consent-spanish-inflected-controls",
  "consent-slovenian-load-controls": "consent-slovenian-load-controls",
  "consent-navigation-timeout": "consent-navigation-timeout",
  "consent-focused-privacy-opt-out": "consent-focused-privacy-opt-out",
  "consent-manage-preferences": "consent-manage-preferences",
  "consent-no-reject": "consent-no-reject",
  "consent-late-first-layer-controls": "consent-late-first-layer-controls",
  "consent-late-first-layer-choice-controls": "consent-late-first-layer-choice-controls",
  "consent-late-without-cmp-runtime": "consent-late-without-cmp-runtime",
  "consent-late-cmp-choice-controls": "consent-late-cmp-choice-controls",
  "consent-late-ketch-portuguese-controls": "consent-late-ketch-portuguese-controls",
  "consent-renderer-contention-delayed-controls": "consent-renderer-contention-delayed-controls",
  "consent-transparent-input-overlays": "consent-transparent-input-overlays",
  "consent-privacy-choice-surface-reject-success": "consent-privacy-choice-surface-reject-success",
  "consent-privacy-choice-only": "consent-privacy-choice-only",
  "consent-privacy-opt-out-ad-comparison": "consent-privacy-opt-out-ad-comparison",
  "consent-privacy-opt-out-radio-form-ad-comparison": "consent-privacy-opt-out-radio-form-ad-comparison",
  "consent-preference-center-ambiguous": "consent-preference-center-ambiguous",
  "consent-preference-center-confirm-save": "consent-preference-center-confirm-save",
  "consent-post-choice-reopen-control": "consent-post-choice-reopen-control",
  "consent-preference-center-reject-success": "consent-preference-center-reject-success",
  "consent-preference-center-toggle-save": "consent-preference-center-toggle-save",
  "consent-reject-subscribe": "consent-reject-subscribe",
  "consent-reject-pay": "consent-reject-pay",
  "consent-required-only": "consent-required-only",
  "consent-simple-accept-reject": "consent-simple",
  "consent-sits-style-preferences": "consent-sits-style-preferences",
  "consent-tracking-persists-after-reject": "consent-persists",
  "post-refusal-reject-honored": "post-refusal-reject-honored",
  "post-refusal-reject-handler-after-dom-ready": "post-refusal-reject-handler-after-dom-ready",
  "post-refusal-certscore-owned-analytics": "post-refusal-certscore-owned-analytics",
  "post-refusal-reject-observation-long-task": "post-refusal-reject-observation-long-task",
  "post-refusal-reject-action-phase-nonessential": "post-refusal-reject-action-phase-nonessential",
  "post-refusal-reject-ignored": "post-refusal-reject-ignored",
  "post-refusal-reject-missing": "post-refusal-reject-missing",
  "post-refusal-reject-persistence-only": "post-refusal-reject-persistence-only",
  "post-refusal-reject-unconfirmed": "post-refusal-reject-unconfirmed",
  "post-refusal-reject-inflight": "post-refusal-reject-inflight",
  "post-refusal-reject-inflight-redirect-flood": "post-refusal-reject-inflight-redirect-flood",
  "post-refusal-reject-click-fails": "post-refusal-reject-click-fails",
  "post-refusal-reject-click-confirmed-after-error": "post-refusal-reject-click-confirmed-after-error",
  "post-refusal-reject-reresolved-before-click": "post-refusal-reject-reresolved-before-click",
  "post-refusal-reject-stale-storage": "post-refusal-reject-stale-storage",
  "post-refusal-reject-request-flood": "post-refusal-reject-request-flood",
  "post-refusal-reject-storage-write-flood": "post-refusal-reject-storage-write-flood",
  "post-refusal-reject-bing-uet-write": "post-refusal-reject-bing-uet-write",
  "post-refusal-reject-adobe-consent-propagation": "post-refusal-reject-adobe-consent-propagation",
  "post-refusal-reject-lowercase-fs-site-state": "post-refusal-reject-lowercase-fs-site-state",
  "post-refusal-reject-server-cookie": "post-refusal-reject-server-cookie",
  "post-refusal-reject-third-party-cookie": "post-refusal-reject-third-party-cookie",
  "post-refusal-onetrust-tcf-honored": "post-refusal-onetrust-tcf-honored",
  "post-refusal-onetrust-tcf-ignored": "post-refusal-onetrust-tcf-ignored",
  "post-refusal-onetrust-no-reject": "post-refusal-onetrust-no-reject",
  "post-refusal-onetrust-tcf-contradiction": "post-refusal-onetrust-tcf-contradiction",
  "post-refusal-onetrust-tcf-stale": "post-refusal-onetrust-tcf-stale",
  "post-refusal-onetrust-tcf-delayed-contradiction": "post-refusal-onetrust-tcf-delayed-contradiction",
  "post-refusal-onetrust-tcf-storage-unavailable": "post-refusal-onetrust-tcf-storage-unavailable",
  "post-refusal-onetrust-cookie-confirmed": "post-refusal-onetrust-cookie-confirmed",
  "post-refusal-onetrust-continue-without-accepting": "post-refusal-onetrust-continue-without-accepting",
  "post-refusal-onetrust-cookie-navigation": "post-refusal-onetrust-cookie-navigation",
  "post-refusal-onetrust-cookie-stale": "post-refusal-onetrust-cookie-stale",
  "post-refusal-cookiebot-fast": "post-refusal-cookiebot-fast",
  "post-refusal-cookiebot-level-optin-decline-all": "post-refusal-cookiebot-level-optin-decline-all",
  "post-refusal-cookiebot-cookie-stale": "post-refusal-cookiebot-cookie-stale",
  "post-refusal-usercentrics-delayed": "post-refusal-usercentrics-delayed",
  "post-refusal-usercentrics-legacy-deny": "post-refusal-usercentrics-legacy-deny",
  "post-refusal-usercentrics-storage-stale": "post-refusal-usercentrics-storage-stale",
  "post-refusal-canonical-cmp-ambiguous": "post-refusal-canonical-cmp-ambiguous",
  "ga-collection": "ga-page",
  "ga-first-party-vendor-associated-cookie": "ga-first-party-cookie",
  "generic-bare-choice-controls": "generic-bare-choice-controls",
  "generic-cdn-noise": "static-noise",
  "google-ads-measurement": "google-ads",
  "google-doubleclick-pixel": "doubleclick-pixel",
  "google-consent-tag-support": "google-consent",
  "google-owned-unresolved": "google-unresolved",
  "gtm-library-only": "gtm-page",
  "newrelic-performance-monitoring": "newrelic-monitoring",
  "policy-ai-disclosure": "policy-ai",
  "policy-article13-long": "policy-article13-long",
  "policy-article13-accordions": "policy-article13-accordions",
  "policy-international-transfer-recipient-safeguards": "policy-international-transfer-recipient-safeguards",
  "policy-ambiguous-choices": "policy-ambiguous-choices",
  "policy-broken-link": "policy-broken-link",
  "policy-browser-hydrated-document": "policy-browser-hydrated-document",
  "policy-loading-notice-template-shell": "policy-loading-notice-template-shell",
  "policy-canonical-near-privacy-center": "policy-canonical-near-privacy-center",
  "policy-redirected-privacy-center": "policy-redirected-privacy-center",
  "policy-localized-canonical-shell": "policy-localized-canonical-shell",
  "policy-client-challenge": "policy-client-challenge",
  "policy-french-captcha-challenge": "policy-french-captcha-challenge",
  "policy-cookie-link": "policy-cookie-link",
  "policy-do-not-sell-link": "policy-do-not-sell",
  "policy-footer-privacy-delayed": "policy-footer-privacy-delayed",
  "policy-global-footer-delayed": "policy-global-footer-delayed",
  "policy-gold-caltech-common-path": "policy-gold-caltech-common-path",
  "policy-gold-ford-secondary-only": "policy-gold-ford-secondary-only",
  "policy-gold-ikea-common-path": "policy-gold-ikea-common-path",
  "policy-gold-latimes-secondary-only": "policy-gold-latimes-secondary-only",
  "policy-gold-nvidia-secondary-only": "policy-gold-nvidia-secondary-only",
  "policy-gold-privacy-duplicates": "policy-gold-privacy-duplicates",
  "policy-external-choice-platform": "policy-external-choice",
  "policy-footer-privacy": "policy-footer-privacy",
  "policy-google-script-noise": "policy-google-script-noise",
  "policy-google-script-only": "policy-google-script-only",
  "policy-google-like-late-sections": "policy-google-like-late-sections",
  "policy-jsonld-article-body": "policy-jsonld-article-body",
  "policy-homepage-external-url-only-policy-links": "policy-homepage-external-url-only-policy-links",
  "policy-gdpr-transparency-diagnostic-negatives": "policy-gdpr-transparency-diagnostic-negatives",
  "policy-gdpr-transparency-encoded-it": "policy-gdpr-transparency-encoded-it",
  "policy-gdpr-transparency-compact-nl": "policy-gdpr-transparency-compact-nl",
  "policy-gdpr-transparency-latin1-es": "policy-gdpr-transparency-latin1-es",
  "policy-gdpr-transparency-pdf-nl": "policy-gdpr-transparency-pdf-nl",
  "policy-gdpr-transparency-long-wave-one": "policy-gdpr-transparency-long-wave-one",
  "policy-gdpr-transparency-long-wave-two": "policy-gdpr-transparency-long-wave-two",
  "policy-gdpr-transparency-long-wave-three": "policy-gdpr-transparency-long-wave-three",
  "policy-gdpr-transparency-long-wave-four": "policy-gdpr-transparency-long-wave-four",
  "policy-gdpr-transparency-long-wave-five": "policy-gdpr-transparency-long-wave-five",
  "policy-gpc-disclosure-late": "policy-gpc-late",
  "policy-gpc-disclosure": "policy-gpc",
  "policy-generic-links": "policy-generic-links",
  "policy-link-aria-title": "policy-link-aria-title",
  "policy-large-homepage-legal-footer": "policy-large-homepage-legal-footer",
  "policy-large-homepage-middle-legal-footer": "policy-large-homepage-middle-legal-footer",
  "policy-late-gdpr-sections": "policy-late-gdpr-sections",
  "policy-latimes-footer-surfaces": "policy-latimes-footer-surfaces",
  "policy-localized-privacy-supplement": "policy-localized-privacy-supplement",
  "policy-mature-real-prose": "policy-mature-real-prose",
  "policy-medal-rendered-privacy": "policy-medal-rendered-privacy",
  "policy-multilingual-article13-topics": "policy-multilingual-article13-topics",
  "policy-multilingual-surfaces": "policy-multilingual-surfaces",
  "policy-late-rendered-pl-privacy-links": "policy-late-rendered-pl-privacy-links",
  "policy-neighboring-footer-privacy-noise": "policy-neighboring-footer-privacy-noise",
  "policy-powered-by-attribution": "policy-powered-by-attribution",
  "policy-secondary-third-party-links": "policy-secondary-third-party-links",
  "policy-onetrust-index-json": "policy-onetrust-index-json",
  "policy-onetrust-notice-json": "policy-onetrust-notice-json",
  "policy-privacy-document-index": "policy-privacy-document-index",
  "policy-lancaster-style-privacy-index": "policy-lancaster-style-privacy-index",
  "policy-privacy-center-link": "policy-privacy-center",
  "policy-rendered-article13-better": "policy-rendered-article13-better",
  "policy-rendered-incomplete-substantive": "policy-rendered-incomplete-substantive",
  "policy-retention-rights-only": "policy-retention-rights-only",
  "policy-state-privacy-rights-link": "policy-state-rights",
  "policy-cmp-preference-control": "policy-cmp-preference-control",
  "policy-manage-cookies-footer-control": "policy-manage-cookies-footer-control",
  "policy-manage-cookies-footer-anchor": "policy-manage-cookies-footer-anchor",
  "policy-manage-cookies-embedded-config": "policy-manage-cookies-embedded-config",
  "policy-no-links": "policy-no-links",
  "policy-no-links-pt": "policy-no-links-pt",
  "policy-no-links-es": "policy-no-links-es",
  "policy-noisy-policy-body": "policy-noisy-policy-body",
  "policy-notice-at-collection-link": "policy-notice-at-collection",
  "policy-privacy-choices-link": "policy-privacy-choices",
  "policy-static-core-surfaces": "policy-static-core-surfaces",
  "policy-static-legacy-plus-rendered-canonical": "policy-static-legacy-plus-rendered-canonical",
  "policy-url-stub-canonical": "policy-url-stub-canonical",
  "policy-session-replay-disclosure": "policy-session-replay",
  "policy-vendor-mentions": "policy-vendors",
  "policy-webmd-like-secondary-surfaces": "policy-webmd-like-secondary",
  "region-coded-collection-endpoint": "region-coded-collection",
  "security-access-temporarily-restricted": "security-access-temporarily-restricted",
  "security-background-challenge-normal-site": "security-background-challenge-normal-site",
  "security-cloudflare-challenge": "security-cloudflare-challenge",
  "security-datadome-challenge": "security-datadome-challenge",
  "security-kasada-challenge": "security-kasada-challenge",
  "security-polish-temporary-interstitial": "security-polish-temporary-interstitial",
  "no-go-blank-page": "no-go-blank-page",
  "no-go-cloudflare-dns-error": "no-go-cloudflare-dns-error",
  "no-go-branded-technical-error": "no-go-branded-technical-error",
  "no-go-confirmed-sparse-shell": "no-go-confirmed-sparse-shell",
  "no-go-configuration-error": "no-go-configuration-error",
  "no-go-loading-stalled": "no-go-loading-stalled",
  "no-go-minimal-not-found": "no-go-minimal-not-found",
  "no-go-not-found": "no-go-not-found",
  "no-go-placeholder": "no-go-placeholder",
  "no-go-real-world-access-shells": "no-go-real-world-access-shells",
  "no-go-site-not-ready": "no-go-site-not-ready",
  "no-go-technical-placeholder": "no-go-technical-placeholder",
  "no-go-unsupported-region": "no-go-unsupported-region",
  "branded-login-page": "branded-login-page",
  "site-owned-infrastructure": "site-infra",
  "third-party-cookie-positive": "third-party-cookie",
  "unresolved-collection-endpoint": "unresolved-page",
};

const fixturePagesBySlug = new Map<string, StaticFixturePage>(
  Object.entries(fixtureSlugs).map(([page, slug]) => [slug, page as StaticFixturePage]),
);

const onePixelGif = Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

const fixturePrivacyPdfNl = createTextPdf([
  "NOS Privacy Reglement 2026",
  "In dit Privacy Reglement leest u hoe de organisatie omgaat met uw persoonsgegevens.",
  "Uw persoonsgegevens worden zorgvuldig en in overeenstemming met de AVG verwerkt.",
  "Persoonsgegevens worden uitsluitend verwerkt voor het doel waarvoor ze zijn verkregen.",
  "Wij beschrijven de doeleinden van de verwerking van persoonsgegevens.",
  "De verwerkingsverantwoordelijke is bereikbaar via privacy@example.test.",
  "De functionaris voor gegevensbescherming is bereikbaar via dpo@example.test.",
  "U heeft het recht om klacht in te dienen bij een toezichthoudende autoriteit.",
].join("\n"));

export async function startStaticFixtureServer(options: { port?: number } = {}): Promise<StaticFixtureServer> {
  const requestCounts = new Map<string, number>();
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://fixture.local").pathname;
    requestCounts.set(pathname, (requestCounts.get(pathname) ?? 0) + 1);
    handleRequest(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    urlFor(page: StaticFixturePage): string {
      return `${baseUrl}/f/${fixtureSlugs[page]}`;
    },
    requestCountFor(pathname: string): number {
      return requestCounts.get(pathname) ?? 0;
    },
    close(): Promise<void> {
      return closeServer(server);
    },
  };
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://fixture.local");
  response.setHeader("Cache-Control", "no-store");

  if (url.pathname.startsWith("/f/")) {
    const page = fixturePagesBySlug.get(url.pathname.replace("/f/", ""));
    if (page) {
      serveCase(page, response);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("unknown fixture");
    return;
  }

  if (url.pathname === "/post-refusal/navigation-settled") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><main>Refusal navigation settled.</main></body></html>");
    return;
  }

  if (url.pathname === "/post-refusal/delayed-reject-handler.js") {
    const timer = setTimeout(() => {
      if (response.destroyed) return;
      response.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      response.end(`
        document.querySelector('[data-certscore-consent-action="reject"]')?.addEventListener("click", () => {
          localStorage.setItem("certscore_fixture_consent", "rejected");
          document.querySelector("#certscore-fixture-consent-banner")?.remove();
        });
      `);
    }, 350);
    response.on("close", () => clearTimeout(timer));
    return;
  }

  if (url.pathname === "/frames/consent-reject") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><body>
      <div id="banner" role="dialog" aria-label="OneTrust Cookie consent">
        <p>OneTrust Cookie Preferences. We use cookies for analytics and advertising.</p>
        <button id="reject-all" type="button">Reject All</button>
        <button id="accept-all" type="button">Accept All</button>
      </div>
    </body></html>`);
    return;
  }

  if (url.pathname.startsWith("/cdn-cgi/challenge-platform/")) {
    response.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    response.end("window.__certscoreFixtureCloudflareChallenge = true;");
    return;
  }

  if (url.pathname === "/browser-visible-policy-homepage") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(429, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("static fetch blocked");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>Browser rendered policy links</title></head>
        <body>
          <main>Fixture homepage available to rendered browser discovery.</main>
          <footer><a href="/browser-visible-policy-homepage/privacy">Privacy Policy</a></footer>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/stalled-policy-homepage") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      // Ford-like fixture: the static homepage response never becomes usable,
      // while browser-rendered discovery remains available.
      const delayed = setTimeout(() => {
        if (!response.destroyed) response.destroy();
      }, 15_000);
      response.on("close", () => clearTimeout(delayed));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><body>
      <main>Rendered homepage</main>
      <footer><a href="/stalled-policy-homepage/privacy">Privacy Policy</a></footer>
    </body></html>`);
    return;
  }

  if (url.pathname === "/stalled-policy-homepage/privacy") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><title>Ford-like Privacy Policy</title></head><body>
      <h1>Privacy Policy</h1>
      <p>We collect personal data for service delivery and analytics. You may exercise access, deletion, and objection rights by contacting privacy@example.test.</p>
    </body></html>`);
    return;
  }

  if (url.pathname === "/browser-visible-policy-homepage/privacy") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("direct policy fetch forbidden");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>Privacy Policy</title></head>
        <body>
          <main>
            <h1>Privacy Policy</h1>
            <p>The controller for this service can be contacted at privacy@example.test.</p>
            <p>We process personal data to provide services, personalize content, measure performance, and operate customer support.</p>
            <p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>
            <p>Recipients include processors, service providers, analytics providers, advertising partners, and affiliates.</p>
            <p>We retain personal data only as long as necessary for the purposes described or as required by law.</p>
            <p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>
            <p>We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.</p>
            <p>Our data protection officer can be reached through the privacy office, and you may complain to a supervisory authority.</p>
          </main>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/browser-timeout-policy-homepage") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>Policy timeout fixture</title></head>
        <body>
          <main>Fixture homepage with a policy document that times out for direct fetch.</main>
          <footer><a href="/browser-timeout-policy-homepage/privacy">Privacy Policy</a></footer>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/browser-timeout-policy-homepage/privacy") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      const timer = setTimeout(() => {
        if (!response.destroyed) {
          response.writeHead(504, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("policy fetch timed out");
        }
      }, 6_000);
      request.once("close", () => clearTimeout(timer));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>Privacy Policy</title></head>
        <body>
          <main>
            <h1>Privacy Policy</h1>
            <p>The controller for this service can be contacted at privacy@example.test.</p>
            <p>We process personal data to provide services, personalize content, measure performance, and operate customer support.</p>
            <p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>
            <p>Recipients include processors, service providers, analytics providers, advertising partners, and affiliates.</p>
            <p>We retain personal data only as long as necessary for the purposes described or as required by law.</p>
            <p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>
            <p>We may transfer personal data outside the European Economic Area using standard contractual clauses.</p>
            <p>Our data protection officer can be reached through the privacy office, and you may complain to a supervisory authority.</p>
          </main>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/browser-hydrated-policy/privacy") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="de">
          <head><title>Datenschutzhinweis</title></head>
          <body><main>Datenschutzhinweis FOCUS online Webseite FOCUS online Subdomains FOCUS online App</main></body>
        </html>`);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html lang="de">
        <head><title>Datenschutzhinweis</title></head>
        <body>
          <main>
            <h1>Datenschutzhinweis</h1>
            <p>Verantwortlicher für die Datenverarbeitung ist die Fixture GmbH.</p>
            <p>Wir verarbeiten personenbezogene Daten zur Bereitstellung des Angebots, Analyse und Werbung.</p>
            <p>Die Rechtsgrundlage für die Verarbeitung personenbezogener Daten umfasst Einwilligung, Vertragserfüllung und berechtigte Interessen.</p>
            <p>Empfänger personenbezogener Daten sind Dienstleister, die personenbezogene Daten verarbeiten.</p>
            <p>Sie haben Rechte auf Auskunft, Löschung und Widerspruch.</p>
          </main>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/loading-notice-template-shell/privacy") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="en">
          <head><title>Privacy Notice</title></head>
          <body>
            <header>${"Products Insights About Support ".repeat(80)}</header>
            <main>
              <h1>Privacy Notice</h1>
              <p>Loading Privacy Notice...</p>
              <template>
                <a href="{{link}}">{{title}} {{summary}}</a>
                <a href="{{profileLink}}">{{displayName}} {{companyName}}</a>
              </template>
            </main>
            <footer>${"Contact Careers Locations Terms Privacy ".repeat(80)}</footer>
          </body>
        </html>`);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html lang="en">
        <head><title>Privacy Notice</title></head>
        <body>
          <main>
            <h1>Privacy Notice</h1>
            <p>The data controller is Example Test. You can contact the controller at privacy@example.test for privacy questions.</p>
            <p>We process personal data to provide the service, secure accounts, communicate with customers, and improve our products.</p>
            <p>Our legal bases include contract, consent, legal obligations, and legitimate interests.</p>
            <p>Recipients include hosting providers, analytics providers, payment processors, professional advisers, and public authorities where required.</p>
            <p>We retain personal data only as long as necessary for the purposes described and applicable legal requirements.</p>
            <p>You may request access, correction, deletion, restriction, portability, or object to processing.</p>
            <p>International transfers may use adequacy decisions or standard contractual clauses.</p>
            <p>Our data protection officer can be contacted at dpo@example.test, and you may lodge a complaint with a supervisory authority.</p>
            <p>${"Additional policy context explains the categories of personal data, sources, purposes, recipients, retention criteria, safeguards, individual rights, complaint routes, and policy updates. ".repeat(18)}</p>
          </main>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/metadata-policy/privacy") {
    const articleBody = [
      "Datenschutzerklärung. Verantwortlicher für die Datenverarbeitung ist die Fixture Verlag GmbH.",
      "Unser Datenschutzbeauftragter kann über die Datenschutz Kontaktadresse erreicht werden.",
      "Wir verarbeiten personenbezogene Daten zur Bereitstellung des Angebots, Analyse und Werbung.",
      "Die Rechtsgrundlage für die Verarbeitung personenbezogener Daten umfasst Einwilligung, Vertragserfüllung und berechtigte Interessen.",
      "Empfänger personenbezogener Daten sind Dienstleister, die personenbezogene Daten verarbeiten.",
      "Wir speichern personenbezogene Daten nur so lange, wie es für die genannten Zwecke erforderlich ist.",
      "Sie haben Rechte auf Auskunft, Löschung, Berichtigung und Widerspruch gegen die Verarbeitung personenbezogener Daten.",
      "Personenbezogene Daten können in ein Drittland übermittelt werden, wenn geeignete Garantien bestehen.",
      "Sie können Beschwerde bei einer Aufsichtsbehörde einlegen.",
    ].join(" ");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html lang="de">
        <head>
          <title>Datenschutzerklärung</title>
          <script type="application/ld+json">${JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Datenschutzerklärung",
            articleBody,
          })}</script>
        </head>
        <body>
          <header><svg><text>Logo</text></svg><nav>News Politik Sport Kultur Abo Suche</nav></header>
          <main><h1>Datenschutzerklärung</h1><p>Diese Seite enthält strukturierte Richtlinieninformationen.</p></main>
          <footer>Kontakt Impressum Newsletter Werbung</footer>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/rendered-article13-better/privacy") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <html lang="fr">
          <head><title>Politique de confidentialité</title></head>
          <body>
            <main>
              <h1>Politique de confidentialité</h1>
              <p>Centre de confidentialité. Cette page présente des liens d'aide, les abonnements, les newsletters, les contacts du service client, les paramètres du compte, les offres éditoriales, les espaces lecteurs, les informations commerciales et les rubriques générales du site.</p>
              <p>La confidentialité est importante pour les lecteurs. Retrouvez également nos applications, nos podcasts, nos conditions de vente, nos pages d'assistance, nos informations de connexion et nos services d'abonnement.</p>
            </main>
          </body>
        </html>`);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html lang="fr">
        <head><title>Politique de confidentialité</title></head>
        <body>
          <main>
            <h1>Politique de confidentialité</h1>
            <p>Le responsable du traitement indique le contact protection des données et le délégué à la protection des données.</p>
            <p>Nous expliquons les finalités du traitement des données personnelles et la base juridique du traitement des données personnelles.</p>
            <p>Les catégories de destinataires des données personnelles comprennent les prestataires qui traitent les données personnelles.</p>
            <p>Nous conservons les données personnelles pendant la durée nécessaire aux finalités décrites dans cette politique.</p>
            <p>Vous disposez d'un droit d'accès aux données personnelles, de rectification, d'effacement et d'opposition.</p>
            <p>Les transferts internationaux de données personnelles peuvent être encadrés par des garanties appropriées.</p>
            <p>Vous pouvez introduire une réclamation auprès d'une autorité de contrôle.</p>
          </main>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/rendered-incomplete-substantive/privacy") {
    const shared = [
      "The controller for this service can be contacted through the privacy office.",
      "We process personal data to provide services and improve the product.",
      "We rely on consent, contract, legal obligation, and legitimate interests as legal bases.",
      "Recipients include processors, service providers, and analytics partners.",
      "We retain personal data only as long as necessary.",
      "You may exercise rights to access, rectify, erase, restrict, and object.",
      "International transfers use standard contractual clauses where required.",
    ];
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><head><title>Privacy Policy</title></head><body><main>
        <h1>Privacy Policy</h1>
        ${shared.map((text) => `<p>${text}</p>`).join("")}
        <p>${"General privacy information for customers and visitors. ".repeat(24)}</p>
      </main></body></html>`);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><title>Privacy Policy</title></head><body><main>
      <h1>Privacy Policy</h1>
      ${shared.map((text) => `<p>${text}</p>`).join("")}
      <p>Our data protection officer can be reached at dpo@example.test.</p>
      <p>You have the right to lodge a complaint with a supervisory authority.</p>
      <p>${"Additional policy details explain how personal data is handled for customers and visitors. ".repeat(30)}</p>
    </main></body></html>`);
    return;
  }

  if (url.pathname === "/medal/privacy") {
    if (request.headers["sec-fetch-mode"] !== "navigate") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html><head><title>Privacy Policy | Medal.tv</title></head><body><main><h1>Privacy Policy</h1><p>Loading...</p></main></body></html>`);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><title>Privacy Policy | Medal.tv</title></head><body><main>
      <h1>Privacy Policy</h1>
      <p>Medal B.V. acts as the data controller and can be contacted at privacy@medal.example.</p>
      <p>The purposes of processing personal data include providing and improving the Services.</p>
      <p>Our legal basis for processing personal data includes consent, contract, legal obligations, and legitimate interests.</p>
      <p>Recipients of personal data include processors, service providers, joint controllers, and analytics partners.</p>
      <p>We retain personal data while an account is active and for no more than 24 months after last use.</p>
      <p>You have the right to access your personal data and the right to erasure, rectification, restriction, objection, and withdrawal of consent.</p>
      <p>International transfers of personal data rely on European Commission Standard Contractual Clauses and additional safeguards.</p>
      <p>Our Data Protection Officer can be contacted at dpo@medal.example.</p>
      <p>You have the right to lodge a complaint with a supervisory authority. The competent authority is the Dutch Data Protection Authority.</p>
      <p>${"Additional policy details describe processing for the Medal platform and website. ".repeat(45)}</p>
    </main></body></html>`);
    return;
  }

  if (url.pathname === "/late-gdpr-sections/privacy") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><title>Privacy Policy</title></head><body><main>
      <h1>Privacy Policy</h1>
      <p>${"General product privacy information describes account data, service delivery, security, and customer support. ".repeat(460)}</p>
      <h2>European privacy disclosures</h2>
      <p>Example Company is the data controller. The data controller can be contacted through privacy@example.test.</p>
      <p>The purposes of processing personal data include providing the service.</p>
      <p>Our legal basis for processing personal data includes contract, consent, legal obligations, and legitimate interests.</p>
      <p>Recipients of personal data include processors, service providers, and analytics vendors.</p>
      <p>We retain personal data only as long as necessary for the stated purposes.</p>
      <p>You have the right to access your personal data and the right to erasure of personal data.</p>
      <p>International transfers of personal data use standard contractual clauses for personal data transfers where required.</p>
      <p>Our data protection officer can be reached at dpo@example.test.</p>
      <p>You have the right to lodge a complaint with a supervisory authority.</p>
    </main></body></html>`);
    return;
  }

  if (url.pathname === "/static/app.css") {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end("body { color: #222; }");
    return;
  }

  if (url.pathname === "/static/app.js") {
    response.writeHead(200, { "Content-Type": "application/javascript" });
    response.end("window.__fixtureStaticLoaded = true;");
    return;
  }

  if (url.pathname === "/pixel.gif") {
    response.writeHead(200, { "Content-Type": "image/gif" });
    response.end(onePixelGif);
    return;
  }

  if (url.pathname === "/fixture-noise-image.gif") {
    response.setHeader("Set-Cookie", "noise_image_cookie=fixture-redacted; Path=/; SameSite=Lax");
    response.writeHead(200, { "Content-Type": "image/gif" });
    response.end(onePixelGif);
    return;
  }

  if (url.pathname === "/cmp/consent-pixel.gif") {
    response.setHeader("Set-Cookie", "OptanonConsent=fixture-redacted; Path=/; SameSite=Lax");
    response.writeHead(200, { "Content-Type": "image/gif" });
    response.end(onePixelGif);
    return;
  }

  if (url.pathname === "/intl/en/policies/privacy-url-stub/") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`http://${request.headers.host}/policies/canonical-privacy`);
    return;
  }

  if (url.pathname === "/redirected-privacy") {
    response.writeHead(302, { Location: "/policycenter/b2c/" });
    response.end();
    return;
  }

  if (url.pathname === "/policycenter/b2c/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><title>Privacy Center</title></head><body>
      <main>
        <h1>Privacy Center</h1>
        <p>Choose the privacy notice that applies to you.</p>
        <p><a href="/policycenter/b2c/en-us">General Privacy Policy</a></p>
        <p><a href="/policycenter/b2c/children">Children's Privacy Policy</a></p>
      </main>
    </body></html>`);
    return;
  }

  if (url.pathname === "/policycenter/b2c/en-us") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html><head><title>General Privacy Policy</title></head><body>
      <main>
        <h1>General Privacy Policy</h1>
        <p>The controller for this service can be contacted at privacy@example.test.</p>
        <p>We process personal data to provide services, personalize content, measure performance, improve security, and operate customer support.</p>
        <p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>
        <p>Recipients include processors, service providers, analytics providers, advertising partners, and affiliates.</p>
        <p>We retain personal data only as long as necessary for the purposes described or as required by law.</p>
        <p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>
        <p>We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.</p>
        <p>Our data protection officer can be reached through the privacy office, and you may complain to a supervisory authority.</p>
        <p>This general notice also describes account preferences, communications, website diagnostics, categories of personal data, sources, safeguards, and privacy choices for adult users of the service.</p>
      </main>
    </body></html>`);
    return;
  }

  if (url.pathname === "/policycenter/b2c/children") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><h1>Children's Privacy Policy</h1></body></html>");
    return;
  }

  if (url.pathname === "/onetrust/notice-shell.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      languages: [
        {
          code: "en-us",
          isDefault: true,
          policyUrl: "/onetrust/notice-shell-en-us.json",
        },
      ],
    }));
    return;
  }

  if (url.pathname === "/onetrust/notice-shell-en-us.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      notices: [{
        title: "Privacy Policy",
        content: [
          "<h1>Privacy Policy</h1>",
          "<p>The controller for this service can be contacted at privacy@example.test.</p>",
          "<p>We process personal data to provide services, personalize content, measure performance, prevent fraud, and operate customer support.</p>",
          "<p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>",
          "<p>Recipients include processors, service providers, analytics providers, advertising partners, and affiliates.</p>",
          "<p>We retain personal data only as long as necessary for the purposes described or as required by law.</p>",
          "<p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>",
          "<p>We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.</p>",
          "<p>Our data protection officer can be reached through the privacy office, and you may complain to a supervisory authority.</p>",
        ].join(" "),
      }],
    }));
    return;
  }

  if (url.pathname === "/onetrust/index-manifest.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      languages: {
        de: { policyUrl: "/onetrust/index-de.json" },
        "en-us": { policyUrl: "/onetrust/index-en-us.json" },
      },
    }));
    return;
  }

  if (url.pathname === "/onetrust/index-en-us.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      notices: {
        index: {
          content: [
            "<p>Our Privacy Policy explains what information we process.</p>",
            "<table><tr><td>English (U.S.)</td><td><a href=\"/policies/onetrust-final-shell\">Privacy Policy</a></td></tr></table>",
          ].join(" "),
        },
      },
    }));
    return;
  }

  if (url.pathname === "/onetrust/final-manifest.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      languages: {
        "en-us": { policyUrl: "/onetrust/final-en-us.json" },
      },
    }));
    return;
  }

  if (url.pathname === "/onetrust/final-en-us.json") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      notices: {
        final: {
          content: [
            "<h1>Warner Bros. Discovery Privacy Policy</h1>",
            "<p>Controllers List. The controller for this service can be contacted at privacy@example.test.</p>",
            "<p>We process personal data to provide services, personalize content, measure performance, and operate customer support.</p>",
            "<p>We rely on consent, contract, legal obligation, and legitimate interests as legal bases for processing.</p>",
            "<p>Recipients include processors, service providers, analytics providers, advertising partners, and affiliates.</p>",
            "<p>We retain personal data only as long as necessary for the purposes described or as required by law.</p>",
            "<p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection.</p>",
            "<p>We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.</p>",
            "<p>Our data protection officer can be reached through the privacy office, and you may complain to a supervisory authority.</p>",
          ].join(" "),
        },
      },
    }));
    return;
  }

  if (url.pathname === "/collect") {
    response.writeHead(204, { "Content-Type": "text/plain" });
    response.end();
    return;
  }

  if (url.pathname === "/post-refusal/inflight.gif") {
    const timer = setTimeout(() => {
      if (response.destroyed) return;
      response.writeHead(200, {
        "Content-Type": "image/gif",
        "Content-Length": String(onePixelGif.length),
      });
      response.end(onePixelGif);
    }, 1_200);
    request.once("close", () => clearTimeout(timer));
    return;
  }

  if (url.pathname === "/post-refusal/inflight-redirect") {
    const timer = setTimeout(() => {
      if (response.destroyed) return;
      response.writeHead(302, {
        "Cache-Control": "no-store",
        Location: "https://www.google-analytics.com/g/collect?v=2&tid=G-LOCALFIXTURE&en=inflight_redirect",
      });
      response.end();
    }, 300);
    request.once("close", () => clearTimeout(timer));
    return;
  }

  if (url.pathname === "/post-refusal/noise.gif") {
    response.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": String(onePixelGif.length),
    });
    response.end(onePixelGif);
    return;
  }

  if (url.pathname === "/post-refusal/set-cookie") {
    response.writeHead(204, {
      "Cache-Control": "no-store",
      "Set-Cookie": "_gid=GA1.1.SERVER_POST_REFUSAL; Path=/; SameSite=Lax; HttpOnly",
    });
    response.end();
    return;
  }

  if (url.pathname === "/policies/article13-latin1-es") {
    response.writeHead(200, { "Content-Type": "text/html; charset=iso-8859-15" });
    response.end(Buffer.from(`<!doctype html>
      <html>
        <head><title>Política de protección de datos personales</title></head>
        <body>
          <main>
            <h1>Política de protección de datos personales</h1>
            <p>El responsable del tratamiento indica el contacto de protección de datos y el delegado de protección de datos.</p>
            <p>Explicamos las finalidades del tratamiento de datos personales y la base jurídica del tratamiento de datos personales.</p>
            <p>Puede presentar una reclamación ante la Agencia Española de Protección de Datos.</p>
          </main>
        </body>
      </html>`, "latin1"));
    return;
  }

  if (url.pathname === "/policies/privacy-compact-nl") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head><title>Privacy reglement</title></head>
        <body>
          <nav>Nieuws over de organisatie Journalistieke verantwoording Programma’s en platforms Onze mensen Uw vragen en reacties</nav>
          <main class="privacy-content">
            <h1>Privacy reglement</h1>
            <p>In het Privacy Reglement lees je hoe de organisatie omgaat met je persoonsgegevens.</p>
            <p>Je persoonsgegevens worden zorgvuldig en in overeenstemming met de AVG en andere toepasselijke privacy regelgeving verwerkt.</p>
            <p>Persoonsgegevens worden uitsluitend verwerkt voor het doel waarvoor ze zijn verkregen.</p>
          </main>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/datenschutz-shell") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html lang="de">
        <head><title>Datenschutzhinweis</title></head>
        <body>
          <main>
            <h1>Datenschutzhinweis</h1>
            <p>FOCUS online Webseite FOCUS online Subdomains FOCUS online App</p>
            <ul>
              <li><a href="/static/datenschutzhinweis_fixture.html">Datenschutzhinweis</a></li>
              <li><a href="/cookie-settings">Datenschutzeinstellungen</a></li>
            </ul>
          </main>
        </body>
      </html>`);
    return;
  }

  if (url.pathname === "/policies/privacy-index-pdf-nl") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html lang="nl"><body>
      <main><h1>Privacy Policy</h1><div id="documents">Privacy documents loading</div></main>
      <script>
        setTimeout(() => {
          document.getElementById("documents").innerHTML = [
            '<a href="/policies/privacy-reglement-nl.pdf">PDF file Privacy Policy (Date: 28.02.2025)</a>',
            '<a href="/policies/privacy-reglement-nl-2024.pdf">PDF file Privacy Policy (Date: 29.11.2024)</a>',
            '<a href="/policies/privacy-reglement-nl-2022.pdf">PDF file Privacy Policy (Date: 07.12.2022)</a>'
          ].join(" ");
        }, 50);
      </script>
    </body></html>`);
    return;
  }

  if ([
    "/policies/privacy-reglement-nl.pdf",
    "/policies/privacy-reglement-nl-2024.pdf",
    "/policies/privacy-reglement-nl-2022.pdf",
  ].includes(url.pathname)) {
    response.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": String(fixturePrivacyPdfNl.length),
    });
    response.end(fixturePrivacyPdfNl);
    return;
  }

  const policyHtml = policyDocumentHtml(url.pathname);
  if (policyHtml) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(policyHtml);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("not found");
}

function serveCase(caseName: StaticFixturePage, response: ServerResponse): void {
  if (caseName === "no-go-not-found") {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(pageHtml(caseName));
    return;
  }
  if (caseName === "security-datadome-challenge") {
    response.setHeader("Set-Cookie", "datadome=fixture-redacted; Path=/; Max-Age=31536000; SameSite=Lax");
    response.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    response.end(pageHtml(caseName));
    return;
  }
  if (caseName === "security-kasada-challenge") {
    response.writeHead(403, {
      "Content-Type": "text/html; charset=utf-8",
      "x-kpsdk-cd": "fixture"
    });
    response.end(pageHtml(caseName));
    return;
  }
  const cookieHeader = cookieForCase(caseName);
  if (cookieHeader) {
    response.setHeader("Set-Cookie", cookieHeader);
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  if (caseName === "consent-navigation-timeout") {
    response.write(`<!doctype html><html><head><title>slow consent</title></head><body>
      <main>CertScore v2 fixture: consent-navigation-timeout</main>
      <section id="onetrust-banner-sdk">
        <p>We use cookies and similar technologies.</p>
        <button>Accept All Cookies</button>
        <button>Reject All Cookies</button>
        <button>Manage Preferences</button>
      </section>`);
    return;
  }
  response.end(pageHtml(caseName));
}

function cookieForCase(caseName: StaticFixturePage): string | undefined {
  if (caseName === "akamai-security-cookie") {
    return "_abck=fixture-redacted; Path=/; SameSite=Lax";
  }
  if (
    caseName === "cmp-cookie" ||
    caseName === "consent-late-first-layer-choice-controls" ||
    caseName === "consent-late-cmp-choice-controls"
  ) {
    return "OptanonConsent=fixture-redacted; Path=/; SameSite=Lax";
  }
  if (caseName === "ga-first-party-vendor-associated-cookie") {
    return "_ga=fixture-redacted; Path=/; SameSite=Lax";
  }
  return undefined;
}

function pageHtml(caseName: StaticFixturePage): string {
  if (caseName === "no-go-blank-page") {
    return "<!doctype html><html><head><title></title></head><body></body></html>";
  }
  if (caseName === "no-go-cloudflare-dns-error") {
    return `<main><h1>Error 1001</h1><h2>DNS resolution error</h2><p>Cloudflare is currently unable to resolve your requested domain.</p></main>`;
  }
  if (caseName === "no-go-branded-technical-error") {
    return `<main><h1>Sorry, we're unable to complete your request</h1><p>We cannot complete your request due to a technical difficulty.</p><p>Error Ref: fixture-123</p></main>`;
  }
  if (caseName === "no-go-confirmed-sparse-shell") {
    return `<main>Do Not Sell or Share My Personal Information</main>`;
  }
  if (caseName === "no-go-loading-stalled") {
    return "<!doctype html><html><head><title>Loading</title></head><body>Loading...</body></html>";
  }
  if (caseName === "no-go-minimal-not-found") {
    return "<!doctype html><html><head><title>Not Found</title></head><body>Not Found</body></html>";
  }
  return `<!doctype html>
<html lang="${caseName === "consent-slovenian-load-controls"
    ? "sl"
    : caseName === "policy-no-links-pt"
      ? "pt-BR"
      : "en"}">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(caseName)}</title>
    ${headMarkup(caseName)}
  </head>
  <body>
    <main data-case="${escapeHtml(caseName)}">CertScore v2 fixture: ${escapeHtml(caseName)}</main>
    ${bodyMarkup(caseName)}
  </body>
</html>`;
}

function headMarkup(caseName: StaticFixturePage): string {
  if (caseName === "gtm-library-only") {
    return `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST"></script>`;
  }
  if (caseName === "generic-cdn-noise") {
    return [
      `<link rel="stylesheet" href="https://static.examplecdn.com/app.css">`,
      `<script src="https://static.examplecdn.com/app.js"></script>`,
    ].join("\n");
  }
  return "";
}

function bodyMarkup(caseName: StaticFixturePage): string {
  if (caseName.startsWith("post-refusal-")) {
    return postRefusalFixtureMarkup(caseName);
  }
  if (caseName.startsWith("consent-")) {
    return consentFlowHomeMarkup(caseName);
  }
  if (caseName.startsWith("policy-")) {
    return policyHomeMarkup(caseName);
  }
  if (caseName === "ga-collection") {
    return `<img alt="" src="https://www.google-analytics.com/g/collect?v=2&tid=G-TEST">`;
  }
  if (caseName === "google-consent-tag-support") {
    return `<img alt="" src="https://www.google.com/ccm/collect?gtm=GTM-TEST&gcd=redacted">`;
  }
  if (caseName === "google-ads-measurement") {
    return `<img alt="" src="https://www.google.com/pagead/1p-conversion/123">`;
  }
  if (caseName === "google-doubleclick-pixel") {
    return `<img alt="" src="https://cm.g.doubleclick.net/pixel?google_nid=fixture">`;
  }
  if (caseName === "google-owned-unresolved") {
    return `<img alt="" src="https://www.google.com/collect?event=fixture">`;
  }
  if (caseName === "clarity-collection") {
    return `<img alt="" src="https://n.clarity.ms/collect?project=fixture">`;
  }
  if (caseName === "clarity-f-collection") {
    return `<img alt="" src="https://f.clarity.ms/collect?project=fixture">`;
  }
  if (caseName === "demdex-id") {
    return `<img alt="" src="https://dpm.demdex.net/id?d_orgid=fixture">`;
  }
  if (caseName === "embedded-third-party-iframe") {
    return `<iframe title="Embedded video" src="https://www.youtube.com/embed/certscore-fixture"></iframe>`;
  }
  if (caseName === "fingerprinting-api-probe") {
    return `<script>
      window.__fixtureFingerprintingProbeRan = false;
      setTimeout(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillText("CertScore", 1, 10);
          ctx.getImageData(0, 0, 1, 1);
        }
        canvas.toDataURL();
        const glCanvas = document.createElement("canvas");
        const gl = glCanvas.getContext("webgl");
        if (gl) {
          gl.getParameter(gl.VERSION);
        }
        navigator.plugins;
        window.__fixtureFingerprintingProbeRan = true;
        document.body.setAttribute("data-fingerprinting-probe-ran", "true");
      }, 25);
    </script>`;
  }
  if (caseName === "generic-bare-choice-controls") {
    return `
      <section>
        <h1>Account invitation</h1>
        <p>This page has generic invitation choice controls for a product beta.</p>
        <button id="accept-invite" type="button">Accept</button>
        <button id="reject-invite" type="button">Reject</button>
      </section>
    `;
  }
  if (caseName === "newrelic-performance-monitoring") {
    return `<img alt="" src="https://bam.nr-data.net/1/browser/fixture">`;
  }
  if (caseName === "site-owned-infrastructure") {
    return `<img alt="" src="https://video-ads-module.ad-tech.nbcuni.com/v1/freewheel-params">`;
  }
  if (caseName === "third-party-cookie-positive") {
    return `<img alt="" src="https://googleads.g.doubleclick.net/pagead/cookie">`;
  }
  if (caseName === "unresolved-collection-endpoint") {
    return `<img alt="" src="https://collector.example.net/collect?event=fixture">`;
  }
  if (caseName === "region-coded-collection-endpoint") {
    return `<img alt="" src="https://collector.us-east-1.amazonaws.com/collect">`;
  }
  if (caseName === "security-cloudflare-challenge") {
    return `
      <section>
        <h1>Security check</h1>
        <p>We apologise for the interruption. We detected unusual behaviour from your browser, which resembles that of a bot.</p>
        <p>The reasons could be the following: you are using a VPN or privacy software often used by bots, or you are navigating through the website at an unusually high speed.</p>
        <p>Lufthansa thanks you for your understanding.</p>
      </section>
      <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
    `;
  }
  if (caseName === "security-background-challenge-normal-site") {
    return `
      <nav><a href="/products">Products</a><a href="/pricing">Pricing</a><a href="/privacy">Privacy</a></nav>
      <section>
        <h1>Acme analytics for modern teams</h1>
        <p>Measure product adoption, understand customer journeys, and improve your application with reliable reporting.</p>
        <p>Trusted by thousands of product, engineering, and marketing teams around the world.</p>
        <a href="/signup">Start free trial</a>
      </section>
      <script src="/cdn-cgi/challenge-platform/scripts/jsd/background.js"></script>
    `;
  }
  if (caseName === "no-go-not-found") {
    return `<section><h1>404 Not Found</h1><p>The requested page could not be found.</p></section>`;
  }
  if (caseName === "no-go-placeholder") {
    return `<section><h1>Example Domain</h1><p>This domain is for use in illustrative examples.</p></section>`;
  }
  if (caseName === "no-go-minimal-not-found") {
    return `<main>Not Found</main>`;
  }
  if (caseName === "no-go-configuration-error") {
    return `<pre>{"detail":"Wrong domain parts: fixture.example"}</pre>`;
  }
  if (caseName === "no-go-unsupported-region") {
    return `
      <main>
        <h1>Regional access notice</h1>
        <p>Our systems have determined that you are visiting from the EU.</p>
        <p>We have configured our systems to automatically ignore traffic from EU-based internet users.</p>
      </main>
    `;
  }
  if (caseName === "no-go-technical-placeholder") {
    return `
      <main>
        <h1>Technical endpoint</h1>
        <p>This domain is an active and legitimate web address operated for technical purposes, including traffic routing and ad-tracking operations.</p>
      </main>
    `;
  }
  if (caseName === "no-go-real-world-access-shells") {
    return `
      <section>
        <h1>Please verify you are human.</h1>
        <p>Are you a person or a robot? Press and hold below to verify yourself.</p>
      </section>
    `;
  }
  if (caseName === "no-go-site-not-ready") {
    return `
      <main>
        <p>PRELAUNCH · LATTICE ONLINE · V0.0.3</p>
        <p>Your browser can’t render the visitor. It’s probably for the best. Check back at launch.</p>
      </main>
    `;
  }
  if (caseName === "branded-login-page") {
    return `
      <nav><strong>Acme Cloud</strong><a href="/support">Support</a><a href="/status">System status</a></nav>
      <main>
        <h1>Welcome to Acme Cloud</h1>
        <p>Sign in to manage your projects, deployments, team members, and account settings.</p>
        <form><label>Email <input type="email"></label><label>Password <input type="password"></label><button>Sign in</button></form>
        <a href="/signup">Create an account</a><a href="/forgot">Forgot password?</a>
      </main>
    `;
  }
  if (caseName === "security-datadome-challenge") {
    return `
      <script>
        var dd = {
          rt: "c",
          host: "geo.captcha-delivery.com",
          cookie: "fixture-redacted"
        };
      </script>
    `;
  }
  if (caseName === "security-kasada-challenge") {
    return `
      <section>
        <h1>403 Forbidden</h1>
        <p>Request blocked. Protected by Kasada.</p>
        <p>x-kpsdk-cd: fixture</p>
      </section>
    `;
  }
  if (caseName === "security-access-temporarily-restricted") {
    return `
      <section>
        <h1>Access is temporarily restricted</h1>
        <p>We detected unusual activity from your device or network.</p>
        <p>Reasons may include automated activity on your network, JavaScript disabled or not working, or use of developer or inspection tools.</p>
      </section>
    `;
  }
  if (caseName === "security-polish-temporary-interstitial") {
    return `
      <section>
        <h1>TVN24</h1>
        <p>Zaraz wracamy</p>
      </section>
    `;
  }
  return "";
}

function postRefusalFixtureMarkup(caseName: StaticFixturePage): string {
  if (caseName === "post-refusal-reject-handler-after-dom-ready") {
    return `
      <section id="certscore-fixture-consent-banner" aria-label="Cookie choices">
        <p>Choose whether optional analytics cookies may be used.</p>
        <button data-certscore-consent-action="reject" type="button">Reject all</button>
      </section>
      <script src="/post-refusal/delayed-reject-handler.js"></script>
    `;
  }
  if (caseName === "post-refusal-certscore-owned-analytics") {
    return `
      <section aria-label="Cookie and analytics preferences">
        <p>Optional analytics help improve CertScore.</p>
        <div>
          <button class="wm-button wm-button--medium wm-button--ghost" type="button">Cookie settings</button>
          <button class="wm-button wm-button--medium wm-button--secondary" data-certscore-consent-action="reject" type="button">Reject analytics</button>
          <button class="wm-button wm-button--medium wm-button--primary" type="button">Allow analytics</button>
        </div>
      </section>
      <script>
        document.querySelector('[data-certscore-consent-action="reject"]')?.addEventListener("click", () => {
          localStorage.setItem("certscore:analytics-consent:v1", "denied");
          document.querySelector('section[aria-label="Cookie and analytics preferences"]')?.remove();
        });
      </script>
    `;
  }
  if (caseName === "post-refusal-canonical-cmp-ambiguous") {
    return `
      <section>
        <h1>Ambiguous canonical CMP reject fixture</h1>
        <p>Two deterministic CMP controls are intentionally actionable.</p>
      </section>
      <div id="onetrust-banner-sdk">
        <button id="onetrust-reject-all-handler" type="button">Reject all</button>
      </div>
      <div id="CybotCookiebotDialog">
        <button id="CybotCookiebotDialogBodyButtonDecline" type="button">Reject all</button>
      </div>
    `;
  }
  if (
    caseName === "post-refusal-onetrust-tcf-honored" ||
    caseName === "post-refusal-onetrust-tcf-ignored" ||
    caseName === "post-refusal-onetrust-no-reject" ||
    caseName === "post-refusal-onetrust-tcf-contradiction" ||
    caseName === "post-refusal-onetrust-tcf-stale" ||
    caseName === "post-refusal-onetrust-tcf-delayed-contradiction" ||
    caseName === "post-refusal-onetrust-tcf-storage-unavailable" ||
    caseName === "post-refusal-onetrust-cookie-confirmed" ||
    caseName === "post-refusal-onetrust-continue-without-accepting" ||
    caseName === "post-refusal-onetrust-cookie-navigation" ||
    caseName === "post-refusal-onetrust-cookie-stale" ||
    caseName === "post-refusal-cookiebot-fast" ||
    caseName === "post-refusal-cookiebot-level-optin-decline-all" ||
    caseName === "post-refusal-cookiebot-cookie-stale" ||
    caseName === "post-refusal-usercentrics-delayed" ||
    caseName === "post-refusal-usercentrics-legacy-deny" ||
    caseName === "post-refusal-usercentrics-storage-stale"
  ) {
    return namedCmpPostRefusalFixtureMarkup(caseName);
  }
  const rejectMissing = caseName === "post-refusal-reject-missing";
  const rejectUnconfirmed = caseName === "post-refusal-reject-unconfirmed";
  const rejectIgnored = caseName === "post-refusal-reject-ignored";
  const rejectObservationLongTask = caseName === "post-refusal-reject-observation-long-task";
  const rejectInflight = caseName === "post-refusal-reject-inflight";
  const rejectInflightRedirectFlood = caseName === "post-refusal-reject-inflight-redirect-flood";
  const rejectActionPhaseNonessential = caseName === "post-refusal-reject-action-phase-nonessential";
  const rejectPersistenceOnly = caseName === "post-refusal-reject-persistence-only";
  const rejectClickFails = caseName === "post-refusal-reject-click-fails";
  const rejectClickConfirmedAfterError = caseName === "post-refusal-reject-click-confirmed-after-error";
  const rejectReresolvedBeforeClick = caseName === "post-refusal-reject-reresolved-before-click";
  const rejectStaleStorage = caseName === "post-refusal-reject-stale-storage";
  const rejectRequestFlood = caseName === "post-refusal-reject-request-flood";
  const rejectStorageWriteFlood = caseName === "post-refusal-reject-storage-write-flood";
  const rejectBingUetWrite = caseName === "post-refusal-reject-bing-uet-write";
  const rejectAdobeConsentPropagation = caseName === "post-refusal-reject-adobe-consent-propagation";
  const rejectLowercaseFsSiteState = caseName === "post-refusal-reject-lowercase-fs-site-state";
  const rejectServerCookie = caseName === "post-refusal-reject-server-cookie";
  const rejectThirdPartyCookie = caseName === "post-refusal-reject-third-party-cookie";
  return `
    <section>
      <h1>Post-refusal localhost fixture</h1>
      <p>This deterministic fixture is restricted to local scanner development.</p>
    </section>
    <div id="certscore-fixture-consent-banner" role="dialog" aria-label="Cookie consent">
      <p>We use optional analytics cookies. Choose whether to accept or reject them.</p>
      <button type="button" data-certscore-consent-action="accept">Accept all</button>
      ${rejectMissing
        ? ""
        : `<button id="certscore-fixture-reject" type="button" data-certscore-consent-action="reject"${rejectClickFails ? ' style="pointer-events:none"' : ""}>Reject all</button>`}
      ${rejectReresolvedBeforeClick
        ? '<div id="certscore-fixture-click-overlay" style="position:fixed;inset:0;z-index:1000"></div>'
        : ""}
    </div>
    <script>
      const fixtureMode = ${JSON.stringify(caseName)};
      document.cookie = "_ga=GA1.1.LOCALFIXTURE; Path=/; SameSite=Lax";
      if (${JSON.stringify(rejectLowercaseFsSiteState)}) {
        localStorage.setItem("fs_closing_native_notifications_toast_session_count", "1");
      }
      if (${JSON.stringify(rejectStaleStorage)}) {
        localStorage.setItem("certscore_fixture_consent", "rejected");
        if (${JSON.stringify(rejectObservationLongTask)}) {
          setTimeout(() => {
            const blockedUntil = performance.now() + 500;
            while (performance.now() < blockedUntil) {}
          }, 30);
        }
      }
      if (${JSON.stringify(rejectRequestFlood || rejectInflightRedirectFlood)}) {
        for (let index = 0; index < 120; index += 1) {
          fetch("/post-refusal/noise.gif?index=" + index).catch(() => undefined);
        }
      }
      if (${JSON.stringify(rejectStorageWriteFlood)}) {
        for (let index = 0; index < 120; index += 1) {
          localStorage.setItem("certscore_noise_" + index, String(index));
        }
      }
      if (${JSON.stringify(rejectInflight)}) {
        const inFlight = new Image();
        inFlight.alt = "";
        inFlight.src = "/post-refusal/inflight.gif?started=before-refusal";
        document.body.appendChild(inFlight);
      }
      if (${JSON.stringify(rejectInflightRedirectFlood)}) {
        const redirectingInFlight = new Image();
        redirectingInFlight.alt = "";
        redirectingInFlight.src = "/post-refusal/inflight-redirect?started=before-refusal";
        document.body.appendChild(redirectingInFlight);
      }
      if (${JSON.stringify(rejectReresolvedBeforeClick)}) {
        setTimeout(() => document.getElementById("certscore-fixture-click-overlay")?.remove(), 1300);
      }
      document.getElementById("certscore-fixture-reject")?.addEventListener("click", () => {
        document.getElementById("certscore-fixture-consent-banner")?.remove();
        if (${JSON.stringify(rejectUnconfirmed || rejectStaleStorage)}) return;

        if (${JSON.stringify(rejectActionPhaseNonessential)}) {
          document.cookie = "mp_action_phase_mixpanel=ACTION_PHASE; Path=/; SameSite=Lax";
        }
        localStorage.setItem("certscore_fixture_consent", "rejected");
        if (${JSON.stringify(rejectClickConfirmedAfterError)}) {
          const blockedUntil = performance.now() + 2200;
          while (performance.now() < blockedUntil) {}
          return;
        }
        if (!${JSON.stringify(rejectIgnored || rejectRequestFlood || rejectServerCookie || rejectPersistenceOnly)}) {
          document.cookie = "_ga=; Path=/; Max-Age=0; SameSite=Lax";
        }
        if (${JSON.stringify(rejectIgnored || rejectRequestFlood)}) {
          setTimeout(() => {
            document.cookie = "_gid=GA1.1.POSTREFUSAL; Path=/; SameSite=Lax";
            const analytics = new Image();
            analytics.alt = "";
            analytics.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-LOCALFIXTURE&en=post_refusal";
            document.body.appendChild(analytics);
          }, 60);
        }
        if (${JSON.stringify(rejectStorageWriteFlood)}) {
          setTimeout(() => {
            document.cookie = "_gid=GA1.1.POSTREFUSAL_FLOOD; Path=/; SameSite=Lax";
          }, 60);
        }
        if (${JSON.stringify(rejectBingUetWrite)}) {
          setTimeout(() => {
            localStorage.setItem("_uetsid", "POST_REFUSAL_UET_SESSION");
            document.cookie = "_uetvid=POST_REFUSAL_UET_VISITOR; Path=/; SameSite=Lax";
          }, 60);
        }
        if (${JSON.stringify(rejectAdobeConsentPropagation)}) {
          setTimeout(() => {
            fetch("https://adobedc.demdex.net/ee/v1/privacy/set-consent", { method: "POST" })
              .catch(() => undefined);
          }, 60);
        }
        if (${JSON.stringify(rejectServerCookie)}) {
          setTimeout(() => fetch("/post-refusal/set-cookie", { credentials: "include" }), 60);
        }
        if (${JSON.stringify(rejectThirdPartyCookie)}) {
          setTimeout(() => {
            const thirdPartyCookie = new Image();
            thirdPartyCookie.alt = "";
            thirdPartyCookie.src = "https://cookie-fixture.example/post-refusal-cookie";
            document.body.appendChild(thirdPartyCookie);
          }, 60);
        }
      });
    </script>
  `;
}

function namedCmpPostRefusalFixtureMarkup(caseName: StaticFixturePage): string {
  const oneTrust = caseName === "post-refusal-onetrust-tcf-honored" ||
    caseName === "post-refusal-onetrust-tcf-ignored" ||
    caseName === "post-refusal-onetrust-no-reject" ||
    caseName === "post-refusal-onetrust-tcf-contradiction" ||
    caseName === "post-refusal-onetrust-tcf-stale" ||
    caseName === "post-refusal-onetrust-tcf-delayed-contradiction" ||
    caseName === "post-refusal-onetrust-tcf-storage-unavailable" ||
    caseName === "post-refusal-onetrust-cookie-confirmed" ||
    caseName === "post-refusal-onetrust-continue-without-accepting" ||
    caseName === "post-refusal-onetrust-cookie-navigation" ||
    caseName === "post-refusal-onetrust-cookie-stale";
  const contradiction = caseName === "post-refusal-onetrust-tcf-contradiction";
  const ignored = caseName === "post-refusal-onetrust-tcf-ignored";
  const noReject = caseName === "post-refusal-onetrust-no-reject";
  const staleTcf = caseName === "post-refusal-onetrust-tcf-stale";
  const delayedContradiction = caseName === "post-refusal-onetrust-tcf-delayed-contradiction";
  const storageUnavailable = caseName === "post-refusal-onetrust-tcf-storage-unavailable";
  const cookieConfirmed = caseName === "post-refusal-onetrust-cookie-confirmed";
  const continueWithoutAccepting = caseName === "post-refusal-onetrust-continue-without-accepting";
  const cookieNavigation = caseName === "post-refusal-onetrust-cookie-navigation";
  const staleCookie = caseName === "post-refusal-onetrust-cookie-stale";
  const cookieConfirmation = cookieConfirmed || continueWithoutAccepting || cookieNavigation || staleCookie;
  const cookiebotLevelOptinDeclineAll = caseName === "post-refusal-cookiebot-level-optin-decline-all";
  const cookiebot = caseName === "post-refusal-cookiebot-fast" ||
    cookiebotLevelOptinDeclineAll ||
    caseName === "post-refusal-cookiebot-cookie-stale";
  const cookiebotCookieStale = caseName === "post-refusal-cookiebot-cookie-stale";
  const usercentrics = caseName === "post-refusal-usercentrics-delayed" ||
    caseName === "post-refusal-usercentrics-legacy-deny" ||
    caseName === "post-refusal-usercentrics-storage-stale";
  const usercentricsLegacyDeny = caseName === "post-refusal-usercentrics-legacy-deny";
  const usercentricsStorageStale = caseName === "post-refusal-usercentrics-storage-stale";
  const bannerId = oneTrust
    ? "onetrust-banner-sdk"
    : cookiebot
      ? "CybotCookiebotDialog"
      : "usercentrics-root";
  const rejectButton = oneTrust
    ? noReject
      ? '<button id="onetrust-accept-btn-handler" type="button">Accept all</button>'
      : continueWithoutAccepting
      ? '<button class="onetrust-close-btn-handler banner-close-button" type="button">Continue without accepting</button>'
      : '<button id="onetrust-reject-all-handler" type="button">Reject all</button>'
    : cookiebot
      ? cookiebotLevelOptinDeclineAll
        ? '<button id="CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll" type="button">Deny</button>'
        : '<button id="CybotCookiebotDialogBodyButtonDecline" type="button">Reject all</button>'
      : usercentricsLegacyDeny
        ? '<footer id="uc-cmp-footer"><button id="deny" type="button">Reject all</button></footer>'
        : '<footer id="uc-cmp-footer"><button data-testid="uc-deny-all-button" type="button">Reject all</button></footer>';
  const separateOneTrustCloseButton = oneTrust && !continueWithoutAccepting && !noReject
    ? '<button class="onetrust-close-btn-handler onetrust-close-btn-ui banner-close-button ot-close-icon" type="button" aria-label="Close"></button>'
    : "";
  const bannerMarkup = `
    <div id="${bannerId}"${continueWithoutAccepting ? ' class="ot-close-btn-link"' : ""} role="dialog" aria-label="Cookie consent">
      <p>Optional purposes require a choice.</p>
      ${rejectButton}
      ${separateOneTrustCloseButton}
    </div>`;
  const renderDelayMs = usercentrics ? 1_200 : 0;
  return `
    <section>
      <h1>Named CMP post-refusal localhost fixture</h1>
      <p>Fixture CMP: ${oneTrust ? "OneTrust" : cookiebot ? "Cookiebot" : "Usercentrics"}</p>
    </section>
    <div id="certscore-cmp-fixture-root"></div>
    <script>
      const fixtureMode = ${JSON.stringify(caseName)};
      if (${JSON.stringify(storageUnavailable)}) {
        const blockedLocalStorage = window.localStorage;
        const blockedSessionStorage = window.sessionStorage;
        const originalEntries = Object.entries;
        Object.entries = function(value) {
          if (value === blockedLocalStorage || value === blockedSessionStorage) {
            throw new DOMException("Storage snapshot blocked", "SecurityError");
          }
          return originalEntries(value);
        };
      }
      let tcfState = {
        eventStatus: ${JSON.stringify(staleTcf ? "useractioncomplete" : "tcloaded")},
        tcString: ${JSON.stringify(tcfV2CoreString(staleTcf ? [] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))},
        purpose: { consents: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), ${JSON.stringify(!staleTcf)}])) }
      };
      if (${JSON.stringify(cookieConfirmation)}) {
        document.cookie = "OptanonConsent=baseline; Path=/; SameSite=Lax";
      }
      if (${JSON.stringify(cookiebotCookieStale)}) {
        document.cookie = "CookieConsent=baseline; Path=/; SameSite=Lax";
      }
      if (${JSON.stringify(usercentrics)}) {
        localStorage.setItem(${JSON.stringify(usercentricsLegacyDeny ? "ucString" : "uc_settings")}, "baseline");
      }
      if (${JSON.stringify(oneTrust && !cookieConfirmation)}) {
        window.__tcfapi = (command, version, callback) => {
          if (command !== "getTCData" || version !== 2) return callback({}, false);
          callback(JSON.parse(JSON.stringify(tcfState)), true);
        };
      }
      const renderBanner = () => {
        document.getElementById("certscore-cmp-fixture-root").innerHTML = ${JSON.stringify(bannerMarkup)};
        const reject = document.querySelector(${JSON.stringify(
          oneTrust
            ? continueWithoutAccepting
              ? "button.onetrust-close-btn-handler.banner-close-button"
              : "#onetrust-reject-all-handler"
            : cookiebot
              ? cookiebotLevelOptinDeclineAll
                ? "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll"
                : "#CybotCookiebotDialogBodyButtonDecline"
              : usercentricsLegacyDeny
                ? "#uc-cmp-footer #deny"
                : 'button[data-testid="uc-deny-all-button"]',
        )});
        reject?.addEventListener("click", () => {
          document.getElementById(${JSON.stringify(bannerId)})?.remove();
          localStorage.setItem("certscore_fixture_consent", "rejected");
          if (${JSON.stringify(cookiebot)}) {
            document.cookie = "CookieConsent=${cookiebotCookieStale ? "baseline" : "necessary-only"}; Path=/; SameSite=Lax";
          }
          if (${JSON.stringify(usercentrics)}) {
            localStorage.setItem(
              ${JSON.stringify(usercentricsLegacyDeny ? "ucString" : "uc_settings")},
              ${JSON.stringify(usercentricsStorageStale ? "baseline" : "denied")},
            );
          }
          if (${JSON.stringify(oneTrust)}) {
            if (${JSON.stringify(cookieConfirmation)}) {
              document.cookie = "OptanonConsent=${staleCookie ? "baseline" : "rejected"}; Path=/; SameSite=Lax";
              if (${JSON.stringify(cookieNavigation)}) {
                setTimeout(() => window.location.assign("/post-refusal/navigation-settled"), 25);
              }
              return;
            }
            if (${JSON.stringify(staleTcf)}) return;
            tcfState = {
              eventStatus: "useractioncomplete",
              tcString: ${JSON.stringify(tcfV2CoreString(contradiction ? [1] : []))},
              purpose: {
                consents: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
                  String(index + 1),
                  ${JSON.stringify(contradiction)} && index === 0
                ]))
              }
            };
            if (${JSON.stringify(ignored)}) {
              setTimeout(() => {
                document.cookie = "_gid=GA1.1.POSTREFUSAL_ONETRUST; Path=/; SameSite=Lax";
                const analytics = new Image();
                analytics.alt = "";
                analytics.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-LOCALFIXTURE&en=post_refusal";
                document.body.appendChild(analytics);
              }, 60);
            }
            if (${JSON.stringify(delayedContradiction)}) {
              setTimeout(() => {
                tcfState = {
                  eventStatus: "useractioncomplete",
                  tcString: ${JSON.stringify(tcfV2CoreString([1]))},
                  purpose: {
                    consents: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
                      String(index + 1),
                      index === 0
                    ]))
                  }
                };
              }, 90);
            }
          }
        });
      };
      if (${renderDelayMs} > 0) setTimeout(renderBanner, ${renderDelayMs});
      else renderBanner();
    </script>
  `;
}

function tcfV2CoreString(grantedPurposeIds: number[]): string {
  const bytes = Buffer.alloc(22);
  const setBit = (index: number, enabled: boolean) => {
    if (!enabled) return;
    bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
  };
  const setNumber = (offset: number, length: number, value: number) => {
    for (let index = 0; index < length; index += 1) {
      setBit(offset + index, ((value >> (length - index - 1)) & 1) === 1);
    }
  };
  setNumber(0, 6, 2);
  const granted = new Set(grantedPurposeIds);
  for (let purposeId = 1; purposeId <= 24; purposeId += 1) {
    setBit(152 + purposeId - 1, granted.has(purposeId));
  }
  return bytes.toString("base64url");
}

function consentFlowHomeMarkup(caseName: StaticFixturePage): string {
  const options = {
    simple: caseName === "consent-simple-accept-reject",
    sitsStylePreferences: caseName === "consent-sits-style-preferences",
    persists: caseName === "consent-tracking-persists-after-reject",
    acceptOnly: caseName === "consent-accept-only-activation",
    noReject: caseName === "consent-no-reject",
    privacyChoiceOnly: caseName === "consent-privacy-choice-only",
    privacyOptOutAdComparison: caseName === "consent-privacy-opt-out-ad-comparison",
    privacyOptOutRadioFormAdComparison: caseName === "consent-privacy-opt-out-radio-form-ad-comparison",
    focusedPrivacyOptOut: caseName === "consent-focused-privacy-opt-out",
    ambiguous: caseName === "consent-ambiguous-controls",
    acceptEssential: caseName === "consent-accept-essential",
    manage: caseName === "consent-manage-preferences",
    lateFirstLayerControls: caseName === "consent-late-first-layer-controls",
    lateFirstLayerChoiceControls: caseName === "consent-late-first-layer-choice-controls",
    lateWithoutCmpRuntime: caseName === "consent-late-without-cmp-runtime",
    lateCmpChoiceControls: caseName === "consent-late-cmp-choice-controls",
    lateKetchPortugueseControls: caseName === "consent-late-ketch-portuguese-controls",
    rendererContentionDelayedControls: caseName === "consent-renderer-contention-delayed-controls",
    transparentInputOverlays: caseName === "consent-transparent-input-overlays",
    cmpScriptLateSettings: caseName === "consent-cmp-script-late-settings",
    cmpScriptOffscreenContextControls: caseName === "consent-cmp-script-offscreen-context-controls",
    cmpScriptOffscreenFooterSettings: caseName === "consent-cmp-script-offscreen-footer-settings",
    cmpScriptOffscreenOneTrustControls: caseName === "consent-cmp-script-offscreen-onetrust-controls",
    cmpScriptShadowContextControls: caseName === "consent-cmp-script-shadow-context-controls",
    cmpScriptStaggeredControls: caseName === "consent-cmp-script-staggered-controls",
    cmpScriptSupplementalSettings: caseName === "consent-cmp-script-supplemental-settings",
    cmpStaticCanonicalControls: caseName === "consent-cmp-static-canonical-controls",
    cmpScriptVeryLateSettings: caseName === "consent-cmp-script-very-late-settings",
    contextualContinueAccept: caseName === "consent-contextual-continue-accept",
    compactAnalyticsControls: caseName === "consent-compact-analytics-controls",
    compactCookieControls: caseName === "consent-compact-cookie-controls",
    compactPrivacySettingsControls: caseName === "consent-compact-privacy-settings-controls",
    contextualApprovalOffscreen: caseName === "consent-contextual-approval-offscreen",
    dismissOnly: caseName === "consent-dismiss-only",
    firstLayerNecessaryToggleOnly: caseName === "consent-first-layer-necessary-toggle-only",
    firstLayerOptionalToggleOff: caseName === "consent-first-layer-optional-toggle-off",
    firstLayerOptionalToggleOn: caseName === "consent-first-layer-optional-toggle-on",
    firstLayerInternalScrollDefaultsOff: caseName === "consent-first-layer-internal-scroll-defaults-off",
    preferenceAmbiguous: caseName === "consent-preference-center-ambiguous",
    preferenceConfirmSave: caseName === "consent-preference-center-confirm-save",
    postChoiceReopen: caseName === "consent-post-choice-reopen-control",
    preferenceSuccess: caseName === "consent-preference-center-reject-success",
    preferenceToggleSave: caseName === "consent-preference-center-toggle-save",
    rejectSubscribe: caseName === "consent-reject-subscribe",
    rejectPay: caseName === "consent-reject-pay",
    requiredOnly: caseName === "consent-required-only",
    cmpCookie: caseName === "consent-cmp-cookie-persists",
    cmpNetworkLateControls: caseName === "consent-cmp-network-late-controls",
    denyNonEssential: caseName === "consent-deny-non-essential",
    genericLearnMorePageContext: caseName === "consent-generic-learn-more-page-context",
    analyticsCategoryControls: caseName === "consent-analytics-category-controls",
    analyticsCookie: caseName === "consent-analytics-cookie-persists",
    failedClick: caseName === "consent-banner-failed-click",
    statefulClick: caseName === "consent-banner-stateful-click",
    iframeReject: caseName === "consent-iframe-reject",
    localizedControls: caseName === "consent-localized-controls",
    spanishInflectedControls: caseName === "consent-spanish-inflected-controls",
    slovenianLoadControls: caseName === "consent-slovenian-load-controls",
    privacyChoiceSurfaceRejectSuccess: caseName === "consent-privacy-choice-surface-reject-success",
    leanGuardedImageCookie: caseName === "consent-lean-guarded-image-cookie",
    navigationTimeout: caseName === "consent-navigation-timeout",
  };
  if (options.genericLearnMorePageContext) {
    return `
      <main>
        <div aria-hidden="true" style="height: 1400px"></div>
        <section aria-label="Membership products">
          <p>Cookie preferences and privacy choices are described in our site resources.</p>
          <article>
            <h1>Core</h1>
            <p>Build healthy habits with our essential membership.</p>
            <a id="product-learn-more-core" href="/products/core">Learn more about Core</a>
          </article>
          <article>
            <h2>Core+</h2>
            <p>Get additional coaching and community support.</p>
            <a id="product-learn-more-core-plus" href="/products/core-plus">Learn more about Core+</a>
          </article>
          <article>
            <h2>Med+</h2>
            <p>Explore clinician-supported membership services.</p>
            <a id="product-learn-more-med-plus" href="/products/med-plus">Learn more about Med+</a>
          </article>
        </section>
        <section>
          <h2>Privacy resources</h2>
          <p>Read how cookies and privacy choices apply to this website.</p>
          <a href="/policies/privacy">Privacy policy</a>
        </section>
      </main>
    `;
  }
  if (options.sitsStylePreferences) {
    return `
      <main><h1>Consulting services</h1></main>
      <div id="data-protection-preference" role="dialog" aria-label="Data protection preference" style="position: fixed; inset: 10% 15%; padding: 24px; background: #123b55; color: white;">
        <h2>Data protection preference</h2>
        <p>We need your consent before you can continue. Some cookies are essential, while optional services help us analyze and improve this website. Adjust your cookie preferences below.</p>
        <button type="button">Accept all</button>
        <button type="button">Save consent</button>
        <button type="button">Accept essential cookies</button>
      </div>
    `;
  }
  if (options.cmpNetworkLateControls) {
    return `
      <section>
        <h1>News fixture</h1>
        <p>A substantive page whose CMP is initially visible only through a canonical network request.</p>
      </section>
      <img alt="" src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js?fixture=network-only">
      <div id="late-cmp-root"></div>
      <script>
        setTimeout(() => {
          const target = document.getElementById("late-cmp-root");
          if (!target) return;
          target.innerHTML = '<div id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent"><p>We and our partners use cookies for analytics and advertising.</p><button type="button">Accept All</button><button type="button">Show Purposes</button></div>';
        }, 6000);
      </script>
    `;
  }
  if (options.lateFirstLayerControls) {
    return `
      <section>
        <p>Consent-flow fixture page with late first-layer controls.</p>
      </section>
      <div id="banner" role="dialog" aria-label="Cookie consent">
        <p>We use cookies for analytics and advertising. Choose your consent setting.</p>
        <span id="late-controls"></span>
      </div>
      <script>
        setTimeout(() => {
          const target = document.getElementById("late-controls");
          if (!target) return;
          target.innerHTML = '<button id="accept-all" type="button">Accept All</button><button id="reject-all" type="button">Reject All</button><button id="settings" type="button">Cookie settings</button>';
        }, 1100);
      </script>
    `;
  }
  if (options.lateWithoutCmpRuntime) {
    return `
      <section>
        <p>Fixture page whose reject control is injected after ordinary post-settle retries.</p>
      </section>
      <div id="late-consent-banner" role="dialog" aria-label="Privacidad y cookies">
        <p>Elige cómo puede utilizar este sitio las cookies opcionales.</p>
        <button type="button">Configuración de cookies</button>
        <button type="button">Aceptar todas</button>
        <span id="late-consent-controls"></span>
      </div>
      <script>
        setTimeout(() => {
          const target = document.getElementById("late-consent-controls");
          if (!target) return;
          target.innerHTML = '<button type="button">Denegar todas</button>';
        }, 6500);
      </script>
    `;
  }
  if (options.localizedControls) {
    return `
      <section>
        <p>Fixture page with localized first-layer cookie consent controls.</p>
      </section>
      <div id="banner" role="dialog" aria-label="Cookie consent">
        <p>Wir verwenden Cookies fuer Analyse und Werbung. Vous pouvez gerer vos preferences de cookies.</p>
        <p tabindex="0">Mit Klick auf den Button akzeptieren Sie diese Vertragsbedingungen. Details in den Datenschutzhinweisen.</p>
        <button id="accept-all" type="button">Alle akzeptieren</button>
        <button id="reject-all" type="button">Tout refuser</button>
        <button id="settings" type="button">Paramètres des cookies</button>
        <button id="manage-or-reject" type="button">Hantera eller avvisa</button>
      </div>
    `;
  }
  if (options.spanishInflectedControls) {
    return `
      <section>
        <p>Fixture page with observed Spanish first-layer cookie consent controls.</p>
      </section>
      <div id="onetrust-banner-sdk" role="dialog" aria-label="Privacidad y cookies">
        <p>Nos preocupamos por tu privacidad. Usamos cookies y datos personales para publicidad y medición.</p>
        <button id="onetrust-accept-btn-handler" type="button">Acepto</button>
        <button id="onetrust-reject-all-handler" type="button">Rechazarlas todas</button>
        <button id="onetrust-pc-btn-handler" type="button" aria-label="Mostrar los propósitos, Abre el cuadro de diálogo del centro de preferencias.">Mostrar los propósitos</button>
        <button id="turkish-accept" type="button">İzin ver</button>
        <button id="turkish-options" type="button">Seçenekleri yönetin</button>
        <button id="croatian-accept" type="button" aria-label="Prihvati i zatvori: Prihvatite našu obradu podataka i zatvorite">Prihvati i zatvori</button>
        <button id="croatian-options" type="button" aria-label="Saznaj više: Konfigurirajte svoje privole">Saznaj više</button>
      </div>
    `;
  }
  if (options.slovenianLoadControls) {
    return `
      <section>
        <h1>Dobrodošli na Univerzi v Ljubljani</h1>
        <p>Novice, študij in raziskovanje.</p>
      </section>
      <div id="cookie-banner" role="dialog" aria-label="Nastavitve piškotkov"
        style="position: fixed; left: 10%; right: 10%; bottom: 20px; padding: 24px; background: #111; color: white; z-index: 1000;">
        <p>Spletna stran Univerze v Ljubljani uporablja piškotke v skladu z našo <a id="sl-privacy-policy" href="/privacy">politiko varovanja zasebnosti</a>. Nujne, ki so potrebni za nemoteno delovanje spletne strani, smo že naložili. Veseli bomo, če nam dovolite, da naložimo tudi analitične.</p>
        <button id="settings" type="button">Nastavitve</button>
        <button id="necessary-only" type="button">Naloži samo nujne</button>
        <button id="accept-all" type="button">Naloži vse</button>
      </div>
      <footer><a id="sl-combined-policy" href="/cookie-policy">Varstvo zasebnosti in piškotkov</a></footer>
    `;
  }
  if (options.cmpStaticCanonicalControls) {
    return `
      <section>
        <p>Fixture page with CMP-rendered text-ish canonical consent controls.</p>
        ${Array.from({ length: 60 }, (_, index) => `<span id="tarteaucitron-decoy-${index}">Fixture helper ${index}</span>`).join("")}
      </section>
      <script src="https://consent.cookiebot.com/uc.js"></script>
      <script>window.Cookiebot = { fixture: true };</script>
      <div id="cookiebot-banner" role="dialog" aria-label="Sutikimas" style="position: fixed; left: 24px; right: 24px; bottom: 24px; padding: 20px; border: 1px solid #111; background: #fff;">
        <p>Atsakingas jūsų duomenų naudojimas. Naudojame slapukus, kad galėtume suasmeninti turinį ir analizuoti srautą. Galite pasirinkti, kas ir kokiais tikslais naudoja jūsų duomenis. Cookie-Einstellungen.</p>
        <label class="dsgvoaio-checkbox"><input type="checkbox" checked disabled> Essenziell</label>
        <span id="tarteaucitronPersonalize" onclick="void 0" style="display: inline-block; padding: 10px; border: 1px solid #111;">Leisti visus slapukus</span>
        <span id="tarteaucitronCloseAlert" onclick="void 0" style="display: inline-block; padding: 10px; border: 1px solid #111;">Auswahl speichern</span>
        <span id="tarteaucitronCustomize" onclick="void 0" style="display: inline-block; padding: 10px; border: 1px solid #111;">Rinktis</span>
      </div>
    `;
  }
  if (options.compactAnalyticsControls) {
    return `
      <section style="min-height: 1280px;">
        <h1>Analytics consent fixture</h1>
        <p>Primary content appears before a compact consent surface.</p>
      </section>
      <section id="analytics-preferences-panel" style="padding: 16px; border: 1px solid #111;">
        <p>Analytics preferences. We use optional analytics and session-insight tools only after you allow them.</p>
        <button id="reject-analytics" type="button">Reject analytics</button>
        <button id="allow-analytics" type="button">Allow analytics</button>
      </section>
    `;
  }
  if (options.compactCookieControls) {
    return `
      <section style="min-height: 1280px;">
        <h1>German cookie fixture</h1>
        <p>Primary content appears before a compact cookie consent surface.</p>
      </section>
      <section id="cookie-preferences-panel" style="padding: 16px; border: 1px solid #111;">
        <p>Cookie-Einstellungen. Wir verwenden Cookies, um deine Erfahrung zu verbessern. Durch Klicken auf Akzeptieren stimmst du unserem Tracking zu.</p>
        <button id="reject-cookies" type="button">Ablehnen</button>
        <button id="accept-cookies" type="button">Akzeptieren</button>
        <a id="personalize-cookies" href="#cookie-preferences-panel">Personalisieren</a>
      </section>
    `;
  }
  if (options.compactPrivacySettingsControls) {
    return `
      <section style="min-height: 1280px;">
        <h1>Privacy settings fixture</h1>
        <p>Primary content appears before a compact privacy settings surface.</p>
      </section>
      <section id="privacy-settings-panel" style="padding: 16px; border: 1px solid #111;">
        <p>Privacy Settings. We use third-party services that store or retrieve information from your device. By clicking accept, you consent to data storage and processing.</p>
        <button id="settings" type="button">Settings</button>
        <button id="accept" type="button">Accept</button>
      </section>
    `;
  }
  if (options.contextualApprovalOffscreen) {
    return `
      <main style="min-height: 1280px;">
        <h1>Consent approval fixture</h1>
        <p>Primary content appears before a compact consent surface.</p>
      </main>
      <section id="compact-cookie-consent" style="padding: 16px; border: 1px solid #111;">
        <p>This website uses cookies to improve your experience. We also use cookies to show relevant ads and analyze traffic statistics.</p>
        <button id="approval-control" type="button">I’m happy with that</button>
      </section>
      <script>
        window.OneTrust = { fixture: true };
      </script>
    `;
  }
  if (options.dismissOnly) {
    return `
      <main style="min-height: 900px;"><h1>Dismiss-only consent fixture</h1></main>
      <section id="sliding-popup" class="eu-cookie-compliance-banner" style="position: fixed; inset: auto 0 0; padding: 16px; background: green; color: white;">
        <p>This website uses cookies. By continuing you are agreeing to our <a href="/privacy">Privacy Policy</a>.</p>
        <button id="cookie-close" type="button">Close</button>
      </section>
      <script>window.drupalSettings = { eu_cookie_compliance: { popup_enabled: true } };</script>
    `;
  }
  if (options.lateFirstLayerChoiceControls) {
    return `
      <section>
        <p>Consent-flow fixture page with CMP evidence and late first-layer choice controls.</p>
      </section>
      <div id="banner" role="dialog" aria-label="Cookie consent">
        <p>We use cookies for analytics and advertising. Choose your consent setting.</p>
        <button id="settings" type="button">Cookie settings</button>
        <span id="late-choice-controls"></span>
      </div>
      <script>
        window.OneTrust = { fixture: true };
        setTimeout(() => {
          const target = document.getElementById("late-choice-controls");
          if (!target) return;
          target.innerHTML = '<button id="accept-all" type="button">Accept All</button><button id="reject-all" type="button">Reject All</button>';
        }, 3200);
      </script>
    `;
  }
  if (options.lateCmpChoiceControls) {
    return `
      <section>
        <p>Consent-flow fixture page with CMP evidence and delayed first-layer choice controls.</p>
      </section>
      <div id="banner" role="dialog" aria-label="Cookie consent">
        <p>We use cookies for analytics and advertising. Choose your consent setting.</p>
        <span id="late-choice-controls"></span>
      </div>
      <script>
        window.OneTrust = { fixture: true };
        setTimeout(() => {
          const target = document.getElementById("late-choice-controls");
          if (!target) return;
          target.innerHTML = '<button id="settings" type="button">Cookie settings</button><button id="accept-all" type="button">Accept</button><button id="reject-all" type="button">Reject</button>';
        }, 3200);
      </script>
    `;
  }
  if (options.lateKetchPortugueseControls) {
    return `
      <main style="min-height: 900px;">
        <h1>Comércio brasileiro</h1>
        <p>Conteúdo principal carregado antes do banner de consentimento.</p>
      </main>
      <div id="late-ketch-root"></div>
      <script>
        window.Ketch = { fixture: true };
        setTimeout(() => {
          const target = document.getElementById("late-ketch-root");
          if (!target) return;
          target.innerHTML = '<section id="ketch-banner" role="dialog" aria-label="Preferências de cookies" style="position: fixed; inset: auto 0 0; padding: 18px; background: white; border-top: 1px solid #999;"><p>Nós coletamos cookies para oferecer um serviço personalizado. Utilize as opções do banner para configurar suas preferências quanto à coleta de cookies.</p><button id="ketch-preferences" type="button">Preferências</button><button id="ketch-reject" type="button">Rejeitar todos</button><button id="ketch-accept" type="button">Aceitar todos</button></section>';
        }, 6500);
      </script>
    `;
  }
  if (options.transparentInputOverlays) {
    return `
      <main><h1>Generic commerce fixture</h1></main>
      <section role="dialog" aria-label="Cookie choices" style="position: fixed; inset: auto 0 0; padding: 24px; background: white;">
        <h2>Cookies and privacy choices</h2>
        <p>Choose whether optional analytics and advertising cookies may be used.</p>
        <label style="display: inline-block; position: relative; padding: 10px 18px; background: #ffd814;">
          <span>Accept</span>
          <input aria-label="Accept" value="Accept" type="button" style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.01;">
        </label>
        <label style="display: inline-block; position: relative; padding: 10px 18px; background: #eee;">
          <span>Decline</span>
          <input aria-label="Decline" value="Decline" type="button" style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.01;">
        </label>
        <a href="/preferences">Customise</a>
      </section>
    `;
  }
  if (options.rendererContentionDelayedControls) {
    return `
      <main><h1>Delayed consent fixture</h1></main>
      <div id="delayed-consent-root"></div>
      <script>
        setTimeout(() => {
          const target = document.getElementById("delayed-consent-root");
          if (!target) return;
          target.innerHTML = '<section role="dialog" aria-label="Cookie choices"><p>Choose whether optional analytics cookies may be used.</p><button>Accept</button><button>Decline</button><a href="/preferences">Customise</a></section>';
          const blockedUntil = performance.now() + 7600;
          while (performance.now() < blockedUntil) {
            Math.sqrt(144);
          }
        }, 250);
      </script>
    `;
  }
  if (options.cmpScriptOffscreenOneTrustControls || options.cmpScriptOffscreenContextControls || options.cmpScriptOffscreenFooterSettings) {
    const offscreenControlSurface = options.cmpScriptOffscreenOneTrustControls
      ? `
        <section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent" style="margin-top: 1280px; padding: 24px; border: 1px solid #111;">
          <h2>Hej! You are in control of your cookies.</h2>
          <p>On our home page, we use cookies and similar techniques. You may accept analytical cookies or change cookie settings.</p>
          <button id="onetrust-accept-btn-handler" type="button">Accept</button>
          <button id="onetrust-reject-all-handler" type="button">Reject</button>
          <button id="onetrust-pc-btn-handler" type="button">Cookie settings</button>
        </section>
      `
      : options.cmpScriptOffscreenContextControls
        ? `
        <section id="global-cookie-choice-panel" role="dialog" aria-label="Privacy choices" style="margin-top: 1280px; padding: 24px; border: 1px solid #111;">
          <h2>Hej! You are in control of your cookies.</h2>
          <p>On our home page, we use cookies and similar techniques. You may accept analytical cookies. By clicking accept, you consent to all cookies and related data processing. To change your settings or withdraw consent, go to cookie settings.</p>
          <button id="global-cookie-accept" type="button">Accept</button>
          <button id="global-cookie-reject" type="button">Reject</button>
          <button id="global-cookie-settings" type="button">Cookie settings</button>
        </section>
      `
      : `
        <footer style="margin-top: 1280px; padding: 24px;">
          <p>Company footer links and ordinary site controls.</p>
          <button id="footer-cookie-settings" type="button">Cookie Settings</button>
        </footer>
      `;
    return `
      <section style="min-height: 900px;">
        <h1>IKEA-style landing page</h1>
        <p>Viewport content appears before an offscreen consent or footer surface.</p>
      </section>
      <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
      <script>
        window.OneTrust = { fixture: true };
        window.OptanonWrapper = function OptanonWrapper() {};
      </script>
      ${offscreenControlSurface}
    `;
  }
  if (options.cmpScriptShadowContextControls) {
    return `
      <section style="min-height: 900px;">
        <h1>Shadow consent fixture landing page</h1>
        <p>Viewport content appears before a shadow-root consent surface.</p>
      </section>
      <script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>
      <script>
        window.OneTrust = { fixture: true };
        window.OptanonWrapper = function OptanonWrapper() {};
      </script>
      <div id="shadow-consent-host" style="margin-top: 1280px;"></div>
      <script>
        const host = document.getElementById("shadow-consent-host");
        const root = host.attachShadow({ mode: "open" });
        root.innerHTML = \`
          <section id="shadow-cookie-choice-panel" role="dialog" aria-label="Privacy choices" style="padding: 24px; border: 1px solid #111;">
            <h2>You are in control of your cookies.</h2>
            <p>We use cookies and similar techniques. You may accept analytical cookies or change your cookie settings.</p>
            <div id="shadow-accept" role="button" tabindex="0">Accept</div>
            <div id="shadow-reject" role="button" tabindex="0">Reject</div>
            <div id="shadow-settings" role="button" tabindex="0">Cookie settings</div>
          </section>
        \`;
      </script>
    `;
  }
  if (options.cmpScriptStaggeredControls) {
    return `
      <section>
        <h1>Staggered CMP landing page</h1>
        <p>The first-layer consent actions are attached in separate render waves.</p>
      </section>
      <script src="https://cdn.consentmanager.net/delivery/js/semiautomatic.min.js"></script>
      <div id="cmp-root"></div>
      <script>
        window.OneTrust = { fixture: true };
        setTimeout(() => {
          const target = document.getElementById("cmp-root");
          if (!target) return;
          target.innerHTML = '<div id="privacy-settings-modal" role="dialog" aria-label="Privacy Settings"><h2>Privacy Settings</h2><p>Choose how cookies and similar technologies may be used.</p><span id="staggered-actions"></span></div>';
          document.getElementById("staggered-actions").insertAdjacentHTML("beforeend", '<button id="settings" type="button">Settings</button>');
        }, 6500);
        setTimeout(() => {
          document.getElementById("staggered-actions")?.insertAdjacentHTML("beforeend", '<button id="accept" type="button">Accept</button>');
        }, 12500);
        setTimeout(() => {
          document.getElementById("staggered-actions")?.insertAdjacentHTML("beforeend", '<button id="reject" type="button">Reject</button>');
        }, 15200);
      </script>
    `;
  }
  if (options.cmpScriptLateSettings || options.cmpScriptVeryLateSettings || options.cmpScriptSupplementalSettings) {
    const modalDelayMs = options.cmpScriptSupplementalSettings
      ? 14_250
      : options.cmpScriptVeryLateSettings ? 15_200 : 6_500;
    return `
      <section>
        <h1>Numa-style landing page</h1>
        <p>Booking content renders before the CMP surface is attached.</p>
      </section>
      <script src="https://cdn.consentmanager.net/delivery/js/semiautomatic.min.js"></script>
      <div id="cmp-root"></div>
      <script>
        window.OneTrust = { fixture: true };
        setTimeout(() => {
          const target = document.getElementById("cmp-root");
          if (!target) return;
          target.innerHTML = '<div id="privacy-settings-modal" role="dialog" aria-label="Privacy Settings"><h2>Privacy Settings</h2><p>We use third-party services that store or retrieve information from a visitor device. You can manage privacy settings or accept cookies.</p><button id="settings" type="button">Settings</button><button id="accept" type="button">Accept</button></div>';
        }, ${modalDelayMs});
      </script>
    `;
  }
  if (options.privacyOptOutAdComparison || options.privacyOptOutRadioFormAdComparison || options.focusedPrivacyOptOut) {
    const radioForm = options.privacyOptOutRadioFormAdComparison || options.focusedPrivacyOptOut
      ? `
          <form id="privacy-form">
            <h2>Privacy Settings</h2>
            <p>California Privacy Rights Act Right to Opt Out. You may opt out of sale or sharing of personal information.</p>
            <fieldset>
              <legend>Choose an option:</legend>
              <label><input type="radio" name="cpra-choice" value="opt-in" checked> Accept Standard Advertising Settings (Opt In)</label>
              <label><input type="radio" name="cpra-choice" value="opt-out"> Do Not Sell or Share My Personal Information (Opt Out)</label>
            </fieldset>
            <button id="save" type="button">Save</button>
            <p id="status">You opted in</p>
          </form>
        `
      : '<h2>Your Privacy Choices</h2><p>California consumer privacy request form. Opt out of sale or share and targeted advertising.</p><button id="save" type="button">Submit Do Not Sell or Share Request</button><p id="status"></p>';
    return `
      <section>
        <p>Consent-flow fixture page with a separate CCPA privacy choices surface.</p>
      </section>
      <script>
        const privacyMode = new URLSearchParams(location.search).has("privacy");
        function adTrack(label) {
          const img = new Image();
          img.alt = "";
          img.src = "https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123?label=" + encodeURIComponent(label);
          document.body.appendChild(img);
        }
        if (!privacyMode) {
          adTrack("baseline");
        } else {
          const panel = document.createElement("section");
          panel.id = "privacy-choice-panel";
          panel.setAttribute("role", "dialog");
          panel.setAttribute("aria-label", "Your Privacy Choices");
          panel.innerHTML = ${JSON.stringify(radioForm)};
          document.body.appendChild(panel);
          document.getElementById("save")?.addEventListener("click", () => {
            const selected = document.querySelector("input[name='cpra-choice']:checked");
            if (!selected || selected.value === "opt-out") {
              localStorage.setItem("ccpa-opt-out-state", "do-not-sell-share");
              localStorage.setItem("ccpa-opt-out-saved", "true");
              panel.innerHTML = '<h2>Your Privacy Choices</h2><p>Request received. Your opt-out choices were saved for sale or share and targeted advertising.</p><p>You opted out</p>';
            }
          });
        }
      </script>
    `;
  }
  if (options.privacyChoiceSurfaceRejectSuccess) {
    return `
      <section>
        <p>Consent-flow fixture page with a footer privacy control that opens a preference surface.</p>
      </section>
      <footer>
        <button id="privacy-choice" type="button">Your Privacy Choices</button>
      </footer>
      <script>
        function track(label) {
          const img = new Image();
          img.alt = "";
          img.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-CONSENT&en=" + encodeURIComponent(label);
          document.body.appendChild(img);
        }
        document.getElementById("privacy-choice")?.addEventListener("click", () => {
          if (document.getElementById("preference-center")) return;
          const panel = document.createElement("section");
          panel.id = "preference-center";
          panel.setAttribute("role", "dialog");
          panel.setAttribute("aria-label", "Quantcast Choice Privacy Preferences");
          panel.innerHTML = '<h2>Quantcast Choice Privacy Preferences</h2><p>Manage consent for targeted advertising, sale or share, and analytics cookies.</p><button id="pc-reject-all" type="button">Opt out</button><button id="pc-accept-all" type="button">Accept All</button><button id="pc-save" type="button">Save Choices</button>';
          document.body.appendChild(panel);
          document.getElementById("pc-reject-all")?.addEventListener("click", () => {
            localStorage.setItem("qc-consent-state", "rejected");
          });
          document.getElementById("pc-accept-all")?.addEventListener("click", () => {
            localStorage.setItem("qc-consent-state", "accepted");
            document.cookie = "_ga=fixture; Path=/; SameSite=Lax";
            track("accept");
            document.getElementById("preference-center")?.remove();
          });
          document.getElementById("pc-save")?.addEventListener("click", () => {
            document.getElementById("preference-center")?.remove();
          });
        });
      </script>
    `;
  }
  if (options.iframeReject) {
    return `
      <section>
        <p>Consent-flow fixture page with iframe-hosted CMP controls.</p>
      </section>
      <iframe id="cmp-frame" title="OneTrust Cookie Settings" src="/frames/consent-reject"></iframe>
    `;
  }
  if (options.contextualContinueAccept) {
    return `
      <section>
        <p>News article fixture page.</p>
      </section>
      <div id="banner" role="dialog" aria-label="Cookie notice">
        <p>We and our partners use cookies on this site to improve our service, perform analytics, personalize advertising, measure advertising performance, and remember website preferences. By using the site, you consent to these cookies.</p>
        <a href="/policies/cookies">Cookie Policy</a>
        <button id="continue" type="button">Continue</button>
      </div>
    `;
  }
  if (options.analyticsCategoryControls) {
    return `
      <section>
        <p>Consent-flow fixture page with category-scoped controls.</p>
      </section>
      <div id="banner" role="dialog" aria-label="Cookie consent">
        <p>We use optional analytics cookies to measure usage. Choose whether to allow analytics cookies.</p>
        <button id="reject-analytics" type="button">Reject analytics</button>
        <button id="allow-analytics" type="button">Allow analytics</button>
      </div>
    `;
  }
  if (options.firstLayerInternalScrollDefaultsOff) {
    return `
      <section><p>Audi-style internal-scroll consent fixture.</p></section>
      <div id="cookie-settings" role="dialog" aria-label="Cookie settings" style="position:fixed;inset:40px;overflow-y:auto;max-height:260px;background:white;padding:24px;">
        <p>Manage your cookie consent preferences.</p>
        <button id="save-settings" type="button">Save settings and proceed</button>
        <button id="accept-all" type="button">Accept all</button>
        <div style="height:1200px">Cookie settings information</div>
        <div class="purpose-row"><strong>Functional cookies</strong><button role="switch" aria-checked="false" aria-label="off">off</button></div>
        <div class="purpose-row"><strong>Performance cookies</strong><button role="switch" aria-checked="false" aria-label="off">off</button></div>
      </div>
    `;
  }
  if (options.firstLayerOptionalToggleOn || options.firstLayerOptionalToggleOff || options.firstLayerNecessaryToggleOnly) {
    const optionalToggle = options.firstLayerNecessaryToggleOnly
      ? ""
      : `<label class="purpose-row"><input id="analytics-purpose" type="checkbox" ${options.firstLayerOptionalToggleOn ? "checked" : ""}> Analytics cookies</label>`;
    return `
      <section>
        <p>Consent-flow fixture page with first-layer cookie purpose toggles.</p>
      </section>
      <div id="banner" role="dialog" aria-label="Cookie consent">
        <p>We use cookies for analytics and advertising. Manage optional cookie purposes below.</p>
        <label class="purpose-row"><input id="necessary-purpose" type="checkbox" checked disabled> Strictly necessary cookies</label>
        ${optionalToggle}
        <button id="reject-all" type="button">Reject All</button>
        <button id="accept-all" type="button">Accept All</button>
      </div>
    `;
  }
  const preferenceOnly = options.preferenceAmbiguous || options.preferenceConfirmSave || options.preferenceSuccess || options.preferenceToggleSave;
  const rejectLabel = options.rejectSubscribe
    ? "Reject all and subscribe"
    : options.rejectPay
      ? "Reject and Pay"
    : options.requiredOnly
      ? "Required Only"
      : options.denyNonEssential ? "Deny Non-Essential" : "Reject All";
  const rejectButton = options.noReject || options.ambiguous || options.privacyChoiceOnly || options.acceptEssential || preferenceOnly
    ? ""
    : `<button id="reject-all" type="button">${rejectLabel}</button>`;
  const privacyChoiceButton = options.privacyChoiceOnly
    ? `<button id="privacy-choice" type="button">Do not sell or share my personal information</button>`
    : "";
  const acceptButton = options.acceptEssential
    ? `<button id="accept-essential" type="button">Accept Essential</button>`
    : options.denyNonEssential
    ? `<button id="accept-all" type="button">Accept Non-Essential</button>`
    : options.ambiguous
    ? `<button id="continue" type="button">Continue</button>`
    : options.noReject
    ? `<button id="accept-all" type="button"><span>Agree and proceed</span></button>`
    : `<button id="accept-all" type="button">Accept All</button>`;
  const manageButton = options.manage || options.ambiguous || options.noReject || preferenceOnly || options.rejectSubscribe || options.rejectPay
    ? `<button id="settings" type="button">${options.noReject ? "Manage Options" : "Settings"}</button>`
    : "";
  const postChoiceFooter = options.postChoiceReopen
    ? `<footer><button id="post-choice-settings" type="button">Cookie Settings</button></footer>`
    : "";
  return `
    <section>
      <p>Consent-flow fixture page.</p>
    </section>
    <div id="banner" role="dialog" aria-label="Cookie consent">
      <p>We use cookies for analytics and advertising. Choose your consent setting.</p>
      ${options.rejectSubscribe
        ? '<label class="dsgvoaio-checkbox"><input type="checkbox" checked disabled> Essenziell</label>'
        : ""}
      ${acceptButton}
      ${rejectButton}
      ${manageButton}
      ${privacyChoiceButton}
    </div>
    ${postChoiceFooter}
    <script>
      const mode = ${JSON.stringify(caseName)};
      function track(label) {
        const img = new Image();
        img.alt = "";
        img.src = "https://www.google-analytics.com/g/collect?v=2&tid=G-CONSENT&en=" + encodeURIComponent(label);
        document.body.appendChild(img);
      }
      if (mode === "consent-lean-guarded-image-cookie") {
        const noise = new Image();
        noise.alt = "";
        noise.src = "/fixture-noise-image.gif?decorative=1";
        document.body.appendChild(noise);
      }
      function hideBanner() {
        const banner = document.getElementById("banner");
        if (banner && mode !== "consent-banner-failed-click" && mode !== "consent-banner-stateful-click") banner.remove();
      }
      if (mode === "consent-tracking-persists-after-reject") track("preload");
      if (mode === "consent-cmp-cookie-persists") document.cookie = "OptanonConsent=fixture; Path=/; SameSite=Lax";
      if (mode === "consent-analytics-cookie-persists") document.cookie = "_ga=fixture; Path=/; SameSite=Lax";
      if (mode === "consent-preference-center-reject-success") localStorage.setItem("OptanonConsentState", "visible");
      document.getElementById("accept-all")?.addEventListener("click", () => {
        document.cookie = "_ga=fixture; Path=/; SameSite=Lax";
        track("accept");
        hideBanner();
      });
      document.getElementById("accept-essential")?.addEventListener("click", () => {
        localStorage.setItem("essential-consent-state", "essential-only");
        hideBanner();
      });
      document.getElementById("reject-all")?.addEventListener("click", () => {
        if (mode === "consent-tracking-persists-after-reject") track("reject");
        if (mode === "consent-lean-guarded-image-cookie") {
          const consentPixel = new Image();
          consentPixel.alt = "";
          consentPixel.src = "/cmp/consent-pixel.gif?consent=reject";
          document.body.appendChild(consentPixel);
          localStorage.setItem("OptanonConsentState", "rejected");
        }
        if (mode === "consent-banner-stateful-click") {
          document.cookie = "OptanonAlertBoxClosed=fixture; Path=/; SameSite=Lax";
          localStorage.setItem("OptanonConsentState", "rejected");
        }
        hideBanner();
      });
      document.getElementById("continue")?.addEventListener("click", () => {
        track("ambiguous");
        hideBanner();
      });
      function openPreferenceCenter() {
        document.getElementById("banner")?.setAttribute("data-preferences-open", "true");
        if (mode !== "consent-preference-center-reject-success" && mode !== "consent-preference-center-ambiguous" && mode !== "consent-preference-center-toggle-save" && mode !== "consent-preference-center-confirm-save" && mode !== "consent-post-choice-reopen-control") return;
        const existing = document.getElementById("preference-center");
        if (existing) return;
        const panel = document.createElement("section");
        panel.id = "preference-center";
        panel.setAttribute("aria-label", "Cookie preferences");
        panel.innerHTML = mode === "consent-preference-center-reject-success"
          ? '<h2>OneTrust Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-reject-all" type="button">Reject All</button><button id="pc-save" type="button">Save Choices</button>'
            : mode === "consent-preference-center-toggle-save"
              ? '<h2>Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-save" type="button">Save Choices</button>'
            : mode === "consent-preference-center-confirm-save"
              ? '<h2>Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-save" type="button">Confirm My Choice</button>'
              : mode === "consent-post-choice-reopen-control"
                ? '<h2>Cookie Preferences</h2><p>Manage analytics and advertising cookies.</p><button id="pc-save" type="button">Save Choices</button>'
              : '<h2>Cookie Preferences</h2><label><input type="checkbox" checked> Analytics cookies</label><label><input type="checkbox" checked> Advertising cookies</label><button id="pc-continue" type="button">Continue</button><button id="pc-later" type="button">Maybe Later</button>';
        (document.getElementById("banner") ?? document.body).appendChild(panel);
        document.getElementById("pc-reject-all")?.addEventListener("click", () => {
          document.querySelectorAll("#preference-center input[type=checkbox]").forEach((input) => { input.checked = false; });
        });
        document.getElementById("pc-save")?.addEventListener("click", () => {
          if (mode === "consent-preference-center-reject-success") localStorage.setItem("OptanonConsentState", "rejected");
          hideBanner();
        });
      }
      document.getElementById("settings")?.addEventListener("click", openPreferenceCenter);
      document.getElementById("post-choice-settings")?.addEventListener("click", openPreferenceCenter);
    </script>
  `;
}

function policyHomeMarkup(caseName: StaticFixturePage): string {
  const links: Record<string, string> = {
    "policy-ai-disclosure": `<a href="/policies/ai">AI disclosures</a>`,
    "policy-article13-long": `<a href="/policies/article13-long">Privacy Policy</a>`,
    "policy-article13-accordions": `<a href="/policies/article13-accordions">Privacy Policy</a>`,
    "policy-international-transfer-recipient-safeguards": `<a href="/policies/international-transfer-recipient-safeguards">Privacy Policy</a>`,
    "policy-ambiguous-choices": `<a href="/privacy-choices">Your Choices</a>`,
    "policy-broken-link": `<a href="/policies/missing-privacy">Privacy Policy</a>`,
    "policy-browser-hydrated-document": `<a href="/browser-hydrated-policy/privacy">Datenschutzhinweis</a>`,
    "policy-loading-notice-template-shell": `<a href="/loading-notice-template-shell/privacy">Privacy Notice</a>`,
    "policy-canonical-near-privacy-center": `<a href="/privacy-center-shell">Privacy Policy</a>`,
    "policy-redirected-privacy-center": `<a href="/redirected-privacy">Privacy Policy</a>`,
    "policy-localized-canonical-shell": `<a href="/datenschutz-shell">Datenschutzhinweis</a>`,
    "policy-cookie-link": `<a href="/policies/cookies">Cookie Policy</a>`,
    "policy-do-not-sell-link": `<a href="/do-not-sell-or-share">Do Not Sell or Share My Personal Information</a>`,
    "policy-external-choice-platform": `<a href="/privacy-control/onetrust/choices">Your Privacy Choices</a>`,
    "policy-footer-privacy-delayed": `<span id="delayed-footer-anchor"></span><script>setTimeout(() => { document.getElementById("delayed-footer-anchor").outerHTML = '<a href="/policies/privacy">Privacy Policy</a>'; }, 250);</script>`,
    "policy-global-footer-delayed": `<span id="delayed-global-footer"></span><script>setTimeout(() => { document.getElementById("delayed-global-footer").outerHTML = '<a href="/policies/privacy">Privacy Policy</a><a href="/policies/cookies">Cookie Policy</a><a href="/privacy-center">Privacy Center</a><a href="/do-not-sell-or-share">Do Not Sell or Share My Personal Information</a>'; }, 250);</script>`,
    "policy-gold-caltech-common-path": `<a href="/about">About Caltech</a><a href="/terms">Terms</a>`,
    "policy-gold-ford-secondary-only": `<a href="/accessibility">Accessibility</a><a href="/terms">Terms</a>`,
    "policy-gold-ikea-common-path": `<a href="/terms">Terms</a><a href="/accessibility">Accessibility</a>`,
    "policy-gold-latimes-secondary-only": `<a href="/gift-subscription-terms">Gift Subscription Terms</a><a href="/subscriber-terms-and-conditions">Subscriber Terms and Conditions</a><a href="/b2b/ai-technology">AI Technology</a>`,
    "policy-gold-nvidia-secondary-only": `<a href="/en-us/ai-data-science/">AI Data Science</a><a href="/en-eu/gtc/pricing/?nvid=fixture">GTC Pricing</a>`,
    "policy-gold-privacy-duplicates": `<a href="/privacy-policy">Privacy Policy</a><a href="/privacy-policy/">Privacy Policy</a>`,
    "policy-client-challenge": `<a href="/policies/client-challenge">Privacy Policy</a>`,
    "policy-french-captcha-challenge": `<a href="/policies/french-captcha-challenge">Politique de confidentialité</a>`,
    "policy-footer-privacy": `<a href="/policies/privacy">Privacy Policy</a>`,
    "policy-google-script-noise": `<a href="/policies/google-script-noise">Privacy Policy</a>`,
    "policy-google-script-only": `<a href="/policies/google-script-only">Privacy Policy</a>`,
    "policy-google-like-late-sections": `<a href="/policies/google-like-late-sections">Privacy Policy</a>`,
    "policy-jsonld-article-body": `<a href="/metadata-policy/privacy">Datenschutzerklärung</a>`,
    "policy-homepage-external-url-only-policy-links": [
      `<a href="/policies/privacy">Privacy Policy</a>`,
      `<main>`,
      `<p>Partner privacy policies:</p>`,
      `<a href="https://www.facebook.com/privacy/policy/version/20220104">https://www.facebook.com/privacy/policy/version/20220104</a>`,
      `<a href="https://fr.linkedin.com/legal/privacy-policy/">https://fr.linkedin.com/legal/privacy-policy/</a>`,
      `</main>`,
    ].join(" "),
    "policy-gdpr-transparency-diagnostic-negatives": [
      `<a href="/policies/article13-toc-de">Datenschutzerklärung</a>`,
      `<a href="/policies/article13-nav-fr">Politique de confidentialité</a>`,
      `<a href="/policies/article13-support-pl">Polityka prywatności</a>`,
    ].join(" | "),
    "policy-gdpr-transparency-encoded-it": `<a href="/policies/article13-encoded-it">Informativa sulla privacy</a>`,
    "policy-gdpr-transparency-compact-nl": `<a href="/policies/privacy-compact-nl">Privacy reglement</a>`,
    "policy-gdpr-transparency-latin1-es": `<a href="/policies/article13-latin1-es">Política de privacidad</a>`,
    "policy-gdpr-transparency-pdf-nl": `<a href="/policies/privacy-index-pdf-nl">Privacy Policy</a>`,
    "policy-gpc-disclosure-late": `<a href="/policies/gpc-late">Privacy Policy</a>`,
    "policy-gpc-disclosure": `<a href="/policies/gpc">Privacy Notice</a>`,
    "policy-generic-links": `<a href="/products">Products</a><a href="/about">About us</a>`,
    "policy-link-aria-title": `<a href="/policies/privacy" aria-label="Privacy Policy" title="Privacy Policy"></a>`,
    "policy-large-homepage-legal-footer": [
      `<div data-fixture-noise="large-homepage">${"Large publisher body content. ".repeat(24_000)}</div>`,
      `<a href="/legal/page/politique-de-confidentialite">Confidentialité</a>`,
      `<a href="/legal/le-figaro/info-cookies-lefigaro">Info cookies</a>`,
    ].join(" "),
    "policy-large-homepage-middle-legal-footer": [
      `<div data-fixture-noise="large-homepage-head">${"Large publisher body content. ".repeat(14_000)}</div>`,
      `<a href="/corporate-site/datenschutz/datenschutz/artikel-datenschutz-54485502.bild.html">Datenschutz</a>`,
      `<a href="#">Privacy-Manager</a>`,
      `<div data-fixture-noise="large-homepage-tail">${"More publisher body content. ".repeat(14_000)}</div>`,
    ].join(" "),
    "policy-localized-privacy-supplement": [
      `<a href="/politica-de-privacidad">Política de privacidad</a>`,
      `<a href="/politica-de-cookies">Política de cookies</a>`,
      `<a href="/terms">Términos y condiciones</a>`,
    ].join(" | "),
    "policy-latimes-footer-surfaces": [
      `<a href="/privacy-policy">Privacy Policy</a>`,
      `<a href="/terms">Terms of Service</a>`,
      `<a href="/do-not-sell-or-share">Do Not Sell or Share My Personal Information</a>`,
    ].join(" | "),
    "policy-mature-real-prose": `<a href="/policies/mature-real-prose">Privacy Policy</a>`,
    "policy-multilingual-article13-topics": [
      `<a href="/policies/article13-en">Privacy Policy</a>`,
      `<a href="/policies/article13-de">Datenschutzerklärung</a>`,
      `<a href="/policies/article13-fr">Politique de confidentialité</a>`,
      `<a href="/policies/article13-es">Política de privacidad</a>`,
      `<a href="/policies/article13-it">Informativa sulla privacy</a>`,
      `<a href="/policies/article13-nl">Privacybeleid</a>`,
      `<a href="/policies/article13-pl">Polityka prywatności</a>`,
      `<a href="/policies/article13-pt">Política de privacidade</a>`,
    ].join(" | "),
    "policy-gdpr-transparency-long-wave-one": [
      `<a href="/policies/article13-long-pt">Política de privacidade</a>`,
      `<a href="/policies/article13-long-ru">Политика конфиденциальности</a>`,
      `<a href="/policies/article13-long-ja">プライバシーポリシー</a>`,
      `<a href="/policies/article13-long-zh">隐私政策</a>`,
      `<a href="/policies/article13-long-ar">سياسة الخصوصية</a>`,
      `<a href="/policies/article13-long-sv">Integritetspolicy</a>`,
    ].join(" | "),
    "policy-gdpr-transparency-long-wave-two": [
      `<a href="/policies/article13-long-cs">Zásady ochrany osobních údajů</a>`,
      `<a href="/policies/article13-long-el">Πολιτική απορρήτου</a>`,
      `<a href="/policies/article13-long-hu">Adatvédelmi tájékoztató</a>`,
      `<a href="/policies/article13-long-da">Privatlivspolitik</a>`,
      `<a href="/policies/article13-long-fi">Tietosuojakäytäntö</a>`,
    ].join(" | "),
    "policy-gdpr-transparency-long-wave-three": [
      `<a href="/policies/article13-long-sk">Zásady ochrany osobných údajov</a>`,
      `<a href="/policies/article13-long-bg">Политика за поверителност</a>`,
      `<a href="/policies/article13-long-hr">Pravila privatnosti</a>`,
      `<a href="/policies/article13-long-nb">Personvernerklæring</a>`,
      `<a href="/policies/article13-long-sl">Pravilnik o zasebnosti</a>`,
    ].join(" | "),
    "policy-gdpr-transparency-long-wave-four": [
      `<a href="/policies/article13-long-lt">Privatumo politika</a>`,
      `<a href="/policies/article13-long-lv">Privātuma politika</a>`,
      `<a href="/policies/article13-long-et">Privaatsuspoliitika</a>`,
      `<a href="/policies/article13-long-uk">Політика конфіденційності</a>`,
      `<a href="/policies/article13-long-tr">Gizlilik politikası</a>`,
    ].join(" | "),
    "policy-gdpr-transparency-long-wave-five":
      `<a href="/policies/article13-long-ro">Politică de confidențialitate</a>`,
    "policy-multilingual-surfaces": [
      `<a href="/policies/privacy">Privacy Policy</a>`,
      `<a href="/policies/de-datenschutz">Datenschutzerklärung</a>`,
      `<a href="/policies/fr-confidentialite">Politique de confidentialité</a>`,
      `<a href="/policies/es-privacidad">Política de privacidad</a>`,
      `<a href="/policies/it-privacy">Informativa sulla privacy</a>`,
      `<a href="/policies/nl-privacybeleid">Privacybeleid</a>`,
      `<a href="/policies/pl-prywatnosc">Polityka prywatności</a>`,
      `<a href="/policies/cookies">Cookie Policy</a>`,
      `<a href="/policies/nl-cookiebeleid">Cookiebeleid</a>`,
      `<a href="/policies/pl-cookies">Polityka plików cookie</a>`,
      `<a href="/terms">Terms of Service</a>`,
    ].join(" | "),
    "policy-late-rendered-pl-privacy-links": [
      `<span id="late-rendered-privacy-links"></span>`,
      `<a id="late-hydrated-cookie-policy-link" href="javascript:void">Cookie Policy</a>`,
      `<script>`,
      `setTimeout(() => {`,
      `  const root = document.getElementById("late-rendered-privacy-links");`,
      `  const privacy = document.createElement("a");`,
      `  privacy.href = "/policies/privacy";`,
      `  privacy.textContent = "Polityka Prywatności Gazeta.pl";`,
      `  root.appendChild(privacy);`,
      `  document.getElementById("late-hydrated-cookie-policy-link").href = "/policies/cookies";`,
      `}, 1500);`,
      `</script>`,
    ].join(""),
    "policy-powered-by-attribution": [
      `<a href="https://www.onetrust.com/products/cookie-consent/">Powered by OneTrust Opens in a new window</a>`,
      `<a href="/policies/privacy">Privacy Policy</a>`,
    ].join(" | "),
    "policy-secondary-third-party-links": `<a href="/policies/privacy-with-third-party-links">Privacy Policy</a>`,
    "policy-neighboring-footer-privacy-noise": [
      `<a href="/contacto/contacte.html">Contacto</a>`,
      `<a href="/accesibilidad.html">Accesibilidad</a>`,
      `<a href="/auth/v1/sso/auth?continue_url=https%3A%2F%2Ffixture.test">Konto</a>`,
      `<a href="/politica-de-privacidad">Política de privacidad</a>`,
      `<a href="/politica-de-cookies">Cookies</a>`,
    ].join(" | "),
    "policy-privacy-center-link": `<a href="/privacy-center">Privacy Center</a>`,
    "policy-retention-rights-only": `<a href="/policies/rights-only">Privacy Policy</a>`,
    "policy-state-privacy-rights-link": `<a href="/state-privacy-rights">State Privacy Rights</a>`,
    "policy-cmp-preference-control": `<button id="ot-sdk-btn" type="button" aria-label="Cookie Settings">Cookie Settings</button>`,
    "policy-manage-cookies-footer-control": `<main><p>News homepage</p></main><footer><button id="manage-cookies" type="button">Manage Cookies+</button></footer>`,
    "policy-manage-cookies-footer-anchor": `<main><p>News homepage</p></main><footer><a href="#" id="manage-cookies">Manage Cookies</a></footer>`,
    "policy-manage-cookies-embedded-config": `<main><p>News homepage</p></main><script>window.CONSENT_CONFIG={consentLinkTitle:{en:"Manage Cookies+"},privacyCenterLinkTitle:{en:"Privacy Policy"}};</script>`,
    "policy-no-links": "",
    "policy-no-links-pt": `<main lang="pt-BR"><h1>Início</h1><p>Produtos para casa, eletrônicos e eletrodomésticos.</p></main>`,
    "policy-no-links-es": `<main lang="es"><h1>Inicio</h1><p>Información general sobre datos personales.</p></main>`,
    "policy-noisy-policy-body": `<a href="/policies/noisy-privacy">Privacy Policy</a>`,
    "policy-notice-at-collection-link": `<a href="/notice-at-collection">Notice at Collection</a>`,
    "policy-onetrust-index-json": `<a href="/policies/onetrust-index-shell">Privacy Policy</a>`,
    "policy-privacy-document-index": `<a href="/policies/privacy-index">Privacy Policy</a>`,
    "policy-lancaster-style-privacy-index": `<a href="/policies/website-privacy-index">Privacy Policy</a>`,
    "policy-onetrust-notice-json": `<a href="/policies/onetrust-shell">Privacy Policy</a>`,
    "policy-rendered-article13-better": `<a href="/rendered-article13-better/privacy">Politique de confidentialité</a>`,
    "policy-rendered-incomplete-substantive": `<a href="/rendered-incomplete-substantive/privacy">Privacy Policy</a>`,
    "policy-medal-rendered-privacy": `<a href="/medal/privacy">Privacy Policy</a> | <a href="/medal/cookie-notice">Cookie Notice</a> | <a href="/medal/terms">Terms</a>`,
    "policy-late-gdpr-sections": `<a href="/late-gdpr-sections/privacy">Privacy Policy</a>`,
    "policy-privacy-choices-link": `<a href="/privacy-choices">Your Privacy Choices</a>`,
    "policy-static-core-surfaces": [
      `<a href="/policies/privacy">Privacy Policy</a>`,
      `<a href="/policies/cookies">Cookie Policy</a>`,
      `<a href="/privacy-choices">Your Privacy Choices</a>`,
      `<a href="/terms">Terms of Service</a>`,
    ].join(" | "),
    "policy-static-legacy-plus-rendered-canonical": [
      `<a href="/intl/en/policies/privacy/">Privacy</a>`,
      `<a href="/intl/en/policies/terms/">Terms</a>`,
      `<button id="manage-cookies" type="button">Manage cookies</button>`,
      `<span id="canonical-policy-links"></span>`,
      `<script>{ const root = document.getElementById("canonical-policy-links"); const links = [["/policies/privacy", "Privacy https://policies.example.test/privacy?hl=en-IE&fg=1"], ["/policies/cookies", "Personalisation and cookies"], ["/terms", "Terms https://policies.example.test/terms?hl=en-IE&fg=1"]]; for (const [href, text] of links) { const anchor = document.createElement("a"); anchor.href = href; anchor.textContent = text; root.appendChild(anchor); } }</script>`,
    ].join(" | "),
    "policy-url-stub-canonical": [
      `<a href="/intl/en/policies/privacy-url-stub/">Privacy</a>`,
      `<a href="/policies/cookies">Cookie Policy</a>`,
      `<a href="/terms">Terms of Service</a>`,
    ].join(" | "),
    "policy-session-replay-disclosure": `<a href="/policies/session-replay">Privacy Notice</a>`,
    "policy-vendor-mentions": `<a href="/policies/vendors">Privacy Policy</a>`,
    "policy-webmd-like-secondary-surfaces": `<a href="/policies/webmd-like-privacy">Privacy Policy</a>`,
  };
  return `
    <section>
      <p>Fixture storefront homepage with bounded footer policy links for scanner calibration.</p>
    </section>
    <footer>
      ${links[caseName] ?? ""}
    </footer>
  `;
}

type LongArticle13FixtureLocale =
  | "pt" | "ru" | "ja" | "zh" | "ar" | "sv" | "ro" | "cs" | "el" | "hu" | "da"
  | "fi" | "sk" | "bg" | "hr" | "nb" | "sl" | "lt" | "lv" | "et" | "uk" | "tr";

const LONG_ARTICLE13_FIXTURE_COPY: Record<LongArticle13FixtureLocale, {
  title: string;
  opening: string;
  middle: string;
  ending: string;
  filler: string;
}> = {
  pt: {
    title: "Política de privacidade",
    opening: "O responsável pelo tratamento de dados pessoais fornece o contato do controlador e o contato do encarregado de proteção de dados. Explicamos as finalidades do tratamento de dados pessoais.",
    middle: "A base legal para o tratamento de dados pessoais inclui consentimento e contrato. Também descrevemos as categorias de destinatários dos dados pessoais e o prazo de conservação dos dados pessoais.",
    ending: "Você tem o direito de acesso aos dados pessoais. Explicamos as transferências internacionais de dados pessoais, o direito de apresentar reclamação à Autoridade Nacional de Proteção de Dados e as decisões automatizadas com dados pessoais.",
    filler: "Esta política descreve práticas gerais de privacidade, segurança, atendimento e administração da conta sem acrescentar uma conclusão jurídica específica.",
  },
  ru: {
    title: "Политика конфиденциальности",
    opening: "Оператор персональных данных указывает контакт ответственного по защите данных. Мы описываем цели обработки персональных данных.",
    middle: "Правовые основания обработки персональных данных включают согласие и договор. Мы указываем категории получателей персональных данных и срок хранения персональных данных.",
    ending: "Мы объясняем права субъекта персональных данных, трансграничную передачу персональных данных, право подать жалобу в надзорный орган и автоматизированное принятие решений с использованием персональных данных.",
    filler: "Этот раздел описывает общие правила конфиденциальности, безопасности, поддержки и управления учетной записью без отдельного правового вывода.",
  },
  ja: {
    title: "プライバシーポリシー",
    opening: "個人データの管理者はデータ保護責任者への連絡先を示します。個人データを処理する目的について説明します。",
    middle: "個人データ処理の法的根拠、個人データの受領者のカテゴリー、個人データの保存期間について説明します。",
    ending: "データ主体の権利、個人データの国際移転、監督機関に苦情を申し立てる権利、個人データを用いた自動意思決定について説明します。",
    filler: "この節では、特定の法的結論を示すことなく、一般的なプライバシー、安全性、サポート、およびアカウント管理について説明します。",
  },
  zh: {
    title: "隐私政策",
    opening: "个人数据控制者提供数据保护负责人的联系方式。我们说明处理个人数据的目的。",
    middle: "我们说明处理个人数据的法律依据、个人数据接收方的类别以及个人数据的保存期限。",
    ending: "我们说明数据主体的权利、个人数据的跨境传输、向监管机构投诉的权利以及使用个人数据进行自动化决策。",
    filler: "本节介绍一般隐私、安全、客户支持和账户管理措施，不作出单独的法律结论。",
  },
  ar: {
    title: "سياسة الخصوصية",
    opening: "يقدم مراقب البيانات الشخصية بيانات الاتصال بمسؤول حماية البيانات. نشرح أغراض معالجة البيانات الشخصية.",
    middle: "نشرح الأساس القانوني لمعالجة البيانات الشخصية وفئات مستلمي البيانات الشخصية ومدة الاحتفاظ بالبيانات الشخصية.",
    ending: "نشرح حقوق صاحب البيانات والنقل الدولي للبيانات الشخصية والحق في تقديم شكوى إلى سلطة رقابية واتخاذ القرارات الآلية باستخدام البيانات الشخصية.",
    filler: "يصف هذا القسم ممارسات الخصوصية والأمان والدعم وإدارة الحساب بصورة عامة من دون تقديم نتيجة قانونية مستقلة.",
  },
  sv: {
    title: "Integritetspolicy",
    opening: "Personuppgiftsansvarig anger kontaktuppgifter till dataskyddsombudet. Vi beskriver ändamålen med behandlingen av personuppgifter.",
    middle: "Vi beskriver rättslig grund för behandling av personuppgifter, kategorier av mottagare av personuppgifter och lagringstid för personuppgifter.",
    ending: "Vi beskriver den registrerades rättigheter, internationella överföringar av personuppgifter, rätt att lämna in klagomål till en tillsynsmyndighet och automatiserat beslutsfattande med personuppgifter.",
    filler: "Detta avsnitt beskriver allmänna rutiner för integritet, säkerhet, support och kontohantering utan att dra någon särskild rättslig slutsats.",
  },
  ro: {
    title: "Politică de confidențialitate",
    opening: "Operatorul de date cu caracter personal furnizează datele de contact ale responsabilului cu protecția datelor. Explicăm scopurile prelucrării datelor cu caracter personal.",
    middle: "Explicăm temeiul juridic al prelucrării datelor cu caracter personal, categoriile de destinatari ai datelor cu caracter personal și perioada de păstrare a datelor cu caracter personal.",
    ending: "Explicăm drepturile persoanei vizate, transferurile internaționale de date cu caracter personal, dreptul de a depune o plângere la o autoritate de supraveghere și procesul decizional automatizat privind datele cu caracter personal.",
    filler: "Această secțiune descrie practici generale de confidențialitate, securitate, asistență și administrare a contului fără a formula o concluzie juridică separată.",
  },
  cs: {
    title: "Zásady ochrany osobních údajů",
    opening: "Správce osobních údajů uvádí kontaktní údaje pověřence pro ochranu osobních údajů. Popisujeme účely zpracování osobních údajů.",
    middle: "Popisujeme právní základ pro zpracování osobních údajů, kategorie příjemců osobních údajů a dobu uložení osobních údajů.",
    ending: "Popisujeme práva subjektu údajů, mezinárodní předávání osobních údajů, právo podat stížnost u dozorového úřadu a automatizované rozhodování včetně profilování.",
    filler: "Tato část popisuje obecné postupy ochrany soukromí, zabezpečení, podpory a správy účtu bez samostatného právního závěru.",
  },
  el: {
    title: "Πολιτική απορρήτου",
    opening: "Ο υπεύθυνος επεξεργασίας δεδομένων προσωπικού χαρακτήρα παρέχει τα στοιχεία επικοινωνίας του υπευθύνου προστασίας δεδομένων. Περιγράφουμε τους σκοπούς της επεξεργασίας δεδομένων προσωπικού χαρακτήρα.",
    middle: "Περιγράφουμε τη νομική βάση για την επεξεργασία δεδομένων προσωπικού χαρακτήρα, τις κατηγορίες αποδεκτών των δεδομένων προσωπικού χαρακτήρα και το διάστημα αποθήκευσης των δεδομένων προσωπικού χαρακτήρα.",
    ending: "Περιγράφουμε τα δικαιώματα του υποκειμένου των δεδομένων, τις διεθνείς διαβιβάσεις δεδομένων προσωπικού χαρακτήρα, το δικαίωμα υποβολής καταγγελίας σε εποπτική αρχή και την αυτοματοποιημένη λήψη αποφάσεων με δεδομένα προσωπικού χαρακτήρα.",
    filler: "Η ενότητα περιγράφει γενικές πρακτικές απορρήτου, ασφάλειας, υποστήριξης και διαχείρισης λογαριασμού χωρίς χωριστό νομικό συμπέρασμα.",
  },
  hu: {
    title: "Adatvédelmi tájékoztató",
    opening: "A személyes adatok adatkezelője megadja az adatvédelmi tisztviselő elérhetőségeit. Ismertetjük a személyes adatok kezelésének célját.",
    middle: "Ismertetjük az adatkezelés jogalapját, a személyes adatok címzettjeinek kategóriáit és a személyes adatok tárolásának időtartamát.",
    ending: "Ismertetjük az érintett jogait, a személyes adatok nemzetközi továbbítását, a panasz benyújtásának jogát valamely felügyeleti hatósághoz és a személyes adatok felhasználásával történő automatizált döntéshozatalt.",
    filler: "Ez a szakasz az adatvédelem, a biztonság, a támogatás és a fiókkezelés általános gyakorlatait ismerteti külön jogi következtetés nélkül.",
  },
  da: {
    title: "Privatlivspolitik",
    opening: "Den dataansvarlige angiver kontaktoplysninger for databeskyttelsesrådgiveren. Vi beskriver formålene med behandlingen af personoplysninger.",
    middle: "Vi beskriver retsgrundlaget for behandlingen af personoplysninger, kategorier af modtagere af personoplysninger og opbevaringsperioden for personoplysninger.",
    ending: "Vi beskriver den registreredes rettigheder, internationale overførsler af personoplysninger, retten til at indgive en klage til en tilsynsmyndighed og automatiserede afgørelser med personoplysninger.",
    filler: "Dette afsnit beskriver generelle fremgangsmåder for privatliv, sikkerhed, support og kontoadministration uden en særskilt juridisk konklusion.",
  },
  fi: {
    title: "Tietosuojakäytäntö",
    opening: "Rekisterinpitäjän yhteystiedot ja tietosuojavastaavan yhteystiedot annetaan tässä ilmoituksessa. Kuvaamme henkilötietojen käsittelyn tarkoitukset.",
    middle: "Kuvaamme henkilötietojen käsittelyn oikeusperusteen, henkilötietojen vastaanottajaryhmät ja henkilötietojen säilytysajan.",
    ending: "Kuvaamme rekisteröidyn oikeudet, henkilötietojen kansainväliset siirrot, oikeuden tehdä valitus valvontaviranomaiselle ja automatisoidun päätöksenteon mukaan lukien profilointi.",
    filler: "Tässä osiossa kuvataan yleisiä tietosuoja-, turvallisuus-, tuki- ja tilinhallintakäytäntöjä ilman erillistä oikeudellista johtopäätöstä.",
  },
  sk: {
    title: "Zásady ochrany osobných údajov",
    opening: "Kontaktné údaje prevádzkovateľa a kontaktné údaje zodpovednej osoby sú uvedené v tomto oznámení. Opisujeme účely spracúvania osobných údajov.",
    middle: "Opisujeme právny základ spracúvania osobných údajov, kategórie príjemcov osobných údajov a dobu uchovávania osobných údajov.",
    ending: "Opisujeme práva dotknutej osoby, medzinárodné prenosy osobných údajov, právo podať sťažnosť dozornému orgánu a automatizované rozhodovanie vrátane profilovania.",
    filler: "Táto časť opisuje všeobecné postupy ochrany súkromia, bezpečnosti, podpory a správy účtu bez samostatného právneho záveru.",
  },
  bg: {
    title: "Политика за поверителност",
    opening: "Данните за контакт на администратора и данните за контакт на длъжностното лице по защита на данните са посочени тук. Описваме целите на обработването на лични данни.",
    middle: "Описваме правното основание за обработването на лични данни, категориите получатели на лични данни и срока за съхранение на личните данни.",
    ending: "Описваме правата на субекта на данните, международното предаване на лични данни, правото на жалба до надзорен орган и автоматизираното вземане на решения включително профилиране.",
    filler: "Този раздел описва общи практики за поверителност, сигурност, поддръжка и управление на акаунта без отделен правен извод.",
  },
  hr: {
    title: "Pravila privatnosti",
    opening: "Kontaktni podaci voditelja obrade i kontaktni podaci službenika za zaštitu podataka navedeni su u ovoj obavijesti. Opisujemo svrhe obrade osobnih podataka.",
    middle: "Opisujemo pravnu osnovu za obradu osobnih podataka, kategorije primatelja osobnih podataka i razdoblje pohrane osobnih podataka.",
    ending: "Opisujemo prava ispitanika, međunarodne prijenose osobnih podataka, pravo na podnošenje pritužbe nadzornom tijelu i automatizirano donošenje odluka uključujući izradu profila.",
    filler: "Ovaj odjeljak opisuje opće prakse privatnosti, sigurnosti, podrške i upravljanja računom bez zasebnog pravnog zaključka.",
  },
  nb: {
    title: "Personvernerklæring",
    opening: "Kontaktopplysninger til den behandlingsansvarlige og personvernombudets kontaktopplysninger oppgis her. Vi beskriver formålene med behandlingen av personopplysninger.",
    middle: "Vi beskriver rettslig grunnlag for behandling av personopplysninger, kategorier av mottakere av personopplysninger og lagringsperiode for personopplysninger.",
    ending: "Vi beskriver den registrertes rettigheter, internasjonale overføringer av personopplysninger, rett til å klage til en tilsynsmyndighet og automatiserte avgjørelser herunder profilering.",
    filler: "Dette avsnittet beskriver generelle rutiner for personvern, sikkerhet, støtte og kontoadministrasjon uten en særskilt juridisk konklusjon.",
  },
  sl: {
    title: "Pravilnik o zasebnosti",
    opening: "Kontaktni podatki upravljavca in kontaktni podatki pooblaščene osebe za varstvo podatkov so navedeni tukaj. Opisujemo namene obdelave osebnih podatkov.",
    middle: "Opisujemo pravno podlago za obdelavo osebnih podatkov, kategorije prejemnikov osebnih podatkov in obdobje hrambe osebnih podatkov.",
    ending: "Opisujemo pravice posameznika na katerega se nanašajo osebni podatki, mednarodne prenose osebnih podatkov, pravico do vložitve pritožbe pri nadzornem organu in avtomatizirano sprejemanje odločitev vključno z oblikovanjem profilov.",
    filler: "Ta razdelek opisuje splošne prakse zasebnosti, varnosti, podpore in upravljanja računa brez ločenega pravnega zaključka.",
  },
  lt: {
    title: "Privatumo politika",
    opening: "Duomenų valdytojo kontaktiniai duomenys ir duomenų apsaugos pareigūno kontaktiniai duomenys pateikiami čia. Aprašome asmens duomenų tvarkymo tikslus.",
    middle: "Aprašome teisinį asmens duomenų tvarkymo pagrindą, asmens duomenų gavėjų kategorijas ir asmens duomenų saugojimo laikotarpį.",
    ending: "Aprašome duomenų subjekto teises, tarptautinį asmens duomenų perdavimą, teisę pateikti skundą priežiūros institucijai ir automatizuotą sprendimų priėmimą įskaitant profiliavimą.",
    filler: "Šiame skyriuje aprašoma bendra privatumo, saugumo, pagalbos ir paskyros valdymo praktika be atskiros teisinės išvados.",
  },
  lv: {
    title: "Privātuma politika",
    opening: "Pārziņa kontaktinformācija un datu aizsardzības speciālista kontaktinformācija ir norādīta šeit. Aprakstām personas datu apstrādes nolūkus.",
    middle: "Aprakstām personas datu apstrādes juridisko pamatu, personas datu saņēmēju kategorijas un personas datu glabāšanas laikposmu.",
    ending: "Aprakstām datu subjekta tiesības, personas datu starptautisku nosūtīšanu, tiesības iesniegt sūdzību uzraudzības iestādei un automatizētu lēmumu pieņemšanu tostarp profilēšanu.",
    filler: "Šajā sadaļā aprakstīta vispārīga privātuma, drošības, atbalsta un konta pārvaldības prakse bez atsevišķa juridiska secinājuma.",
  },
  et: {
    title: "Privaatsuspoliitika",
    opening: "Vastutava töötleja kontaktandmed ja andmekaitsespetsialisti kontaktandmed on esitatud siin. Kirjeldame isikuandmete töötlemise eesmärke.",
    middle: "Kirjeldame isikuandmete töötlemise õiguslikku alust, isikuandmete vastuvõtjate kategooriaid ja isikuandmete säilitamise ajavahemikku.",
    ending: "Kirjeldame andmesubjekti õigusi, isikuandmete rahvusvahelist edastamist, õigust esitada kaebus järelevalveasutusele ja automatiseeritud otsuste tegemist sealhulgas profiilianalüüsi.",
    filler: "Selles osas kirjeldatakse üldisi privaatsuse, turvalisuse, toe ja konto haldamise tavasid ilma eraldi õigusliku järelduseta.",
  },
  uk: {
    title: "Політика конфіденційності",
    opening: "Контактні дані володільця персональних даних і контактні дані відповідальної особи із захисту даних наведено тут. Описуємо цілі обробки персональних даних.",
    middle: "Описуємо правову підставу для обробки персональних даних, категорії одержувачів персональних даних і строк зберігання персональних даних.",
    ending: "Описуємо права суб'єкта персональних даних, міжнародну передачу персональних даних, право подати скаргу до наглядового органу й автоматизоване прийняття рішень включаючи профілювання.",
    filler: "У цьому розділі описано загальні правила конфіденційності, безпеки, підтримки та керування обліковим записом без окремого правового висновку.",
  },
  tr: {
    title: "Gizlilik politikası",
    opening: "Veri sorumlusunun iletişim bilgileri ve veri koruma görevlisinin iletişim bilgileri burada verilir. Kişisel verilerin işlenme amaçlarını açıklıyoruz.",
    middle: "Kişisel verilerin işlenmesinin hukuki dayanağını, kişisel veri alıcılarının kategorilerini ve kişisel verilerin saklama süresini açıklıyoruz.",
    ending: "İlgili kişinin haklarını, kişisel verilerin uluslararası aktarımını, denetim makamına şikayette bulunma hakkını ve otomatik karar verme ve profillemeyi açıklıyoruz.",
    filler: "Bu bölüm, ayrı bir hukuki sonuca varmadan genel gizlilik, güvenlik, destek ve hesap yönetimi uygulamalarını açıklar.",
  },
};

function longMultilingualArticle13Documents(): Record<string, { title: string; body: string }> {
  return Object.fromEntries((Object.entries(LONG_ARTICLE13_FIXTURE_COPY) as Array<[
    LongArticle13FixtureLocale,
    (typeof LONG_ARTICLE13_FIXTURE_COPY)[LongArticle13FixtureLocale],
  ]>).map(([locale, copy]) => [
    `/policies/article13-long-${locale}`,
    {
      title: copy.title,
      body: [
        copy.opening,
        copy.filler.repeat(Math.ceil(42_000 / Math.max(copy.filler.length, 1) / 2)),
        copy.middle,
        copy.filler.repeat(Math.ceil(42_000 / Math.max(copy.filler.length, 1) / 2)),
        copy.ending,
      ].join(" "),
    },
  ]));
}

function policyDocumentHtml(pathname: string): string | undefined {
  const docs: Record<string, { title: string; body: string }> = {
    "/policies/privacy": {
      title: "Privacy Policy",
      body: "Last updated: May 1, 2026. We use cookies for analytics and advertising. Our service providers include Google Analytics and Meta for measurement and advertising. You may contact privacy@example.test with questions.",
    },
    "/policies/privacy-with-third-party-links": {
      title: "Privacy Policy",
      body: "Last updated: May 1, 2026. We process personal data for analytics and advertising. See our Cookie Policy and partner privacy policies for details.",
    },
    "/policies/de-datenschutz": {
      title: "Datenschutzerklärung",
      body: "Datenschutzerklärung. Wir verarbeiten personenbezogene Daten, verwenden Cookies für Analyse und Werbung und beantworten Datenschutzanfragen unter privacy@example.test.",
    },
    "/static/datenschutzhinweis_fixture.html": {
      title: "Datenschutzhinweis",
      body: "Datenschutzhinweis. Verantwortlicher für die Datenverarbeitung ist die Fixture GmbH. Wir verarbeiten personenbezogene Daten für die Bereitstellung des Angebots, Analyse und Werbung. Die Rechtsgrundlage für die Verarbeitung personenbezogener Daten umfasst Einwilligung, Vertragserfüllung und berechtigte Interessen. Empfänger personenbezogener Daten sind Dienstleister, die personenbezogene Daten verarbeiten. Sie haben Rechte auf Auskunft, Löschung und Widerspruch.",
    },
    "/policies/fr-confidentialite": {
      title: "Politique de confidentialité",
      body: "Politique de confidentialité. Nous traitons des données personnelles, utilisons des cookies pour la mesure et la publicité, et répondons aux demandes de confidentialité.",
    },
    "/legal/page/politique-de-confidentialite": {
      title: "Politique de confidentialité",
      body: "Politique de confidentialité. Le responsable du traitement explique les finalités du traitement des données personnelles, les bases juridiques, les destinataires, les durées de conservation et les droits des personnes. Vous pouvez contacter le délégué à la protection des données et exercer vos droits d'accès, d'effacement, de rectification, d'opposition et de portabilité.",
    },
    "/legal/le-figaro/info-cookies-lefigaro": {
      title: "Info cookies",
      body: "Info cookies. Ce document décrit l'utilisation des cookies nécessaires, des cookies de mesure d'audience, des cookies publicitaires et des partenaires pouvant déposer des traceurs. Vous pouvez paramétrer les cookies depuis le module de consentement.",
    },
    "/corporate-site/datenschutz/datenschutz/artikel-datenschutz-54485502.bild.html": {
      title: "Datenschutz",
      body: "Datenschutzerklärung. Verantwortlicher für die Datenverarbeitung ist die Fixture GmbH. Wir verarbeiten personenbezogene Daten zur Bereitstellung des Angebots, für Analyse, Werbung und Reichweitenmessung. Die Rechtsgrundlagen umfassen Einwilligung, Vertragserfüllung und berechtigte Interessen. Empfänger personenbezogener Daten sind Dienstleister und Partner. Nutzer haben Rechte auf Auskunft, Berichtigung, Löschung, Widerspruch und Beschwerde. Unser Datenschutzbeauftragter ist über datenschutz@example.test erreichbar.",
    },
    "/policies/es-privacidad": {
      title: "Política de privacidad",
      body: "Política de privacidad. Tratamos datos personales, usamos cookies para analítica y publicidad, y atendemos solicitudes de privacidad.",
    },
    "/politica-de-privacidad": {
      title: "Política de privacidad",
      body: "Política de privacidad. Tratamos datos personales y explicamos los fines del tratamiento, la base jurídica, los destinatarios, la conservación y los derechos de privacidad.",
    },
    "/politica-de-privacidade": {
      title: "Política de privacidade",
      body: [
        "A empresa é a controladora dos dados pessoais e disponibiliza contato com o encarregado de proteção de dados.",
        "Esta política explica as finalidades do tratamento, as bases legais aplicáveis, as categorias de dados pessoais coletados e os destinatários dos dados.",
        "Também descreve transferências internacionais, prazos e critérios de conservação, medidas de segurança e o uso de cookies necessários, funcionais, analíticos e publicitários.",
        "O titular pode solicitar acesso, correção, portabilidade, anonimização, bloqueio, eliminação, oposição e revogação do consentimento, além de apresentar reclamação à Autoridade Nacional de Proteção de Dados.",
      ].join(" ").repeat(8),
    },
    "/politica-de-cookies": {
      title: "Política de cookies",
      body: "Política de cookies. Usamos cookies necesarias, analíticas y publicitarias. Puede configurar sus preferencias de cookies desde el panel de consentimiento.",
    },
    "/policies/it-privacy": {
      title: "Informativa sulla privacy",
      body: "Informativa sulla privacy. Trattiamo dati personali, utilizziamo cookie per analisi e pubblicità e rispondiamo alle richieste privacy.",
    },
    "/policies/nl-privacybeleid": {
      title: "Privacybeleid",
      body: "Privacybeleid. We verwerken persoonsgegevens, gebruiken cookies voor analyse en advertenties, en beantwoorden privacyverzoeken.",
    },
    "/policies/pl-prywatnosc": {
      title: "Polityka prywatności",
      body: "Polityka prywatności. Przetwarzamy dane osobowe, używamy plików cookie do analityki i reklamy oraz obsługujemy żądania dotyczące prywatności.",
    },
    "/policies/article13-en": {
      title: "Privacy Policy",
      body: "The data controller provides a privacy contact and our data protection officer. We explain the purposes of processing personal data, the legal basis for processing personal data, categories of recipients of personal data, the retention period for personal data, your right to access your personal data, international transfers of personal data, the right to lodge a complaint with a supervisory authority, and automated decision-making using personal data.",
    },
    "/policies/article13-de": {
      title: "Datenschutzerklärung",
      body: "Der Verantwortlicher für die Datenverarbeitung nennt den Kontakt zum Datenschutz und den Kontakt zum Datenschutzbeauftragten. Wir erklären die Zwecke der Verarbeitung personenbezogener Daten, die Rechtsgrundlage für die Verarbeitung personenbezogener Daten, Kategorien von Empfängern personenbezogener Daten, die Speicherdauer personenbezogener Daten, das Recht auf Auskunft über personenbezogene Daten, die Übermittlung personenbezogener Daten in ein Drittland, das Recht auf Beschwerde bei einer Aufsichtsbehörde und automatisierte Entscheidungsfindung mit personenbezogenen Daten.",
    },
    "/policies/article13-fr": {
      title: "Politique de confidentialité",
      body: "Le responsable du traitement indique le contact protection des données et le délégué à la protection des données. Nous expliquons les finalités du traitement des données personnelles, la base juridique du traitement des données personnelles, les catégories de destinataires des données personnelles, la durée de conservation des données personnelles, le droit d'accès aux données personnelles, les transferts internationaux de données personnelles, le droit d'introduire une réclamation auprès d'une autorité de contrôle et la décision automatisée utilisant des données personnelles.",
    },
    "/policies/article13-es": {
      title: "Política de privacidad",
      body: "El responsable del tratamiento indica el contacto de protección de datos y el delegado de protección de datos. Explicamos las finalidades del tratamiento de datos personales, la base jurídica del tratamiento de datos personales, las categorías de destinatarios de datos personales, el plazo de conservación de datos personales, el derecho de acceso a datos personales, las transferencias internacionales de datos personales, el derecho a presentar una reclamación ante una autoridad de control y decisiones automatizadas con datos personales.",
    },
    "/policies/article13-it": {
      title: "Informativa sulla privacy",
      body: "Il titolare del trattamento indica il contatto protezione dati e il responsabile della protezione dei dati. Spieghiamo le finalità del trattamento dei dati personali, la base giuridica del trattamento dei dati personali, le categorie di destinatari dei dati personali, il periodo di conservazione dei dati personali, il diritto di accesso ai dati personali, i trasferimenti internazionali di dati personali, il diritto di proporre reclamo all'autorità di controllo e decisioni automatizzate con dati personali.",
    },
    "/policies/article13-encoded-it": {
      title: "Informativa sulla privacy",
      body: [
        "RCS MediaGroup S.p.A. e CairoRCS Media S.p.A. sono autonomi Titolari del trattamento dei dati personali raccolti su questo sito.",
        "Conformemente all'impegno dei Titolari, ti informiamo sulle modalit&agrave;, finalit&agrave; e ambito di comunicazione dei tuoi dati personali.",
        "RCS tratta i tuoi dati per le seguenti finalit&agrave;, supportate dalle relative basi giuridiche.",
        "L'elenco aggiornato dei soggetti che sono stati destinatari dei tuoi dati pu&ograve; essere richiesto al Titolare del trattamento.",
        "Per approfondire consulta https://site.adform.com/privacy-center/platform-privacy/product-and-services-privacy-policy/.",
        "Ulteriori indicazioni sono disponibili all'indirizzo: https://priv-policy.imrworldwide.com/priv/browser/it/it/optout.html#choices.",
      ].join(" "),
    },
    "/policies/article13-nl": {
      title: "Privacybeleid",
      body: "De verwerkingsverantwoordelijke noemt het contact gegevensbescherming en de functionaris voor gegevensbescherming. Wij beschrijven de doeleinden van de verwerking van persoonsgegevens, de rechtsgrondslag voor de verwerking van persoonsgegevens, categorieën van ontvangers van persoonsgegevens, de bewaartermijn van persoonsgegevens, het recht op inzage in persoonsgegevens, internationale doorgiften van persoonsgegevens, het recht om klacht in te dienen bij een toezichthoudende autoriteit en geautomatiseerde besluitvorming met persoonsgegevens.",
    },
    "/policies/privacy-compact-nl": {
      title: "Privacy reglement",
      body: [
        "<nav>Nieuws over de organisatie Journalistieke verantwoording Programma’s en platforms Onze mensen Uw vragen en reacties</nav>",
        "<main><h1>Privacy reglement</h1>",
        "<p>In het Privacy Reglement lees je hoe de organisatie omgaat met je persoonsgegevens.</p>",
        "<p>Je persoonsgegevens worden zorgvuldig en in overeenstemming met de AVG en andere toepasselijke privacy regelgeving verwerkt.</p>",
        "<p>Persoonsgegevens worden uitsluitend verwerkt voor het doel waarvoor ze zijn verkregen.</p></main>",
      ].join(" "),
    },
    "/policies/article13-pl": {
      title: "Polityka prywatności",
      body: "Administrator danych podaje kontakt w sprawie ochrony danych oraz inspektor ochrony danych. Opisujemy cele przetwarzania danych osobowych, podstawa prawna przetwarzania danych osobowych, kategorie odbiorców danych osobowych, okres przechowywania danych osobowych, prawo dostępu do danych osobowych, transfery międzynarodowe danych osobowych, prawo do wniesienia skargi do organu nadzorczego oraz zautomatyzowane podejmowanie decyzji z użyciem danych osobowych.",
    },
    "/policies/article13-pt": {
      title: "Política de privacidade",
      body: "O responsável pelo tratamento de dados pessoais fornece o contato do controlador e o contato do encarregado de proteção de dados. Explicamos as finalidades do tratamento de dados pessoais, a base legal para o tratamento de dados pessoais, as categorias de destinatários dos dados pessoais, o prazo de conservação dos dados pessoais, o direito de acesso aos dados pessoais, as transferências internacionais de dados pessoais, o direito de apresentar reclamação à Autoridade Nacional de Proteção de Dados e as decisões automatizadas com dados pessoais.",
    },
    ...longMultilingualArticle13Documents(),
    "/policies/article13-toc-de": {
      title: "Datenschutzerklärung",
      body: "Inhaltsverzeichnis. Zwecke der Verarbeitung personenbezogener Daten. Rechtsgrundlage für die Verarbeitung personenbezogener Daten. Kategorien von Empfängern personenbezogener Daten. Speicherdauer personenbezogener Daten. Recht auf Auskunft über personenbezogene Daten. Übermittlung personenbezogener Daten in ein Drittland. Recht auf Beschwerde bei einer Aufsichtsbehörde. Automatisierte Entscheidungsfindung mit personenbezogenen Daten.",
    },
    "/policies/article13-nav-fr": {
      title: "Politique de confidentialité",
      body: "Navigation de la politique. Finalités du traitement des données personnelles. Base juridique du traitement des données personnelles. Catégories de destinataires des données personnelles. Durée de conservation des données personnelles. Droit d'accès aux données personnelles. Transferts internationaux de données personnelles. Droit d'introduire une réclamation auprès d'une autorité de contrôle. Décision automatisée utilisant des données personnelles.",
    },
    "/policies/article13-support-pl": {
      title: "Polityka prywatności",
      body: "Artykuł pomocy produktu. Szablon formularza zawiera przykładowe etykiety: cele przetwarzania danych osobowych, podstawa prawna przetwarzania danych osobowych, kategorie odbiorców danych osobowych, okres przechowywania danych osobowych, prawo dostępu do danych osobowych, transfery międzynarodowe danych osobowych oraz zautomatyzowane podejmowanie decyzji z użyciem danych osobowych.",
    },
    "/intl/en/policies/privacy/": {
      title: "Legacy Privacy",
      body: "Privacy overview. See the current Privacy Policy for details.",
    },
    "/intl/en/policies/terms/": {
      title: "Legacy Terms",
      body: "Terms overview. See the current Terms for details.",
    },
    "/policies/article13-long": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. We use personal data to provide services, personalize content, measure performance, and improve security.",
        "You can contact the controller at privacy@example.test or by writing to the privacy team.",
        "Filler section one describes product operations, account preferences, support workflows, website diagnostics, and other neutral site functionality in deliberately verbose language so the later Article 13 sections are not adjacent to the opening privacy notice text.",
        "Filler section two repeats neutral operational context about pages, public content, help center links, service availability, communications, preferences, and account administration without adding the disclosure keywords needed by the test.",
        "Filler section three adds more bounded but non-sensitive text to force the scanner to retain a policy excerpt longer than one thousand characters while still staying far below full-policy retention.",
        "We rely on consent, contract, legal obligation, and legitimate interests as lawful bases for processing depending on context.",
        "Recipients include service providers, processors, analytics providers, advertising partners, and affiliates that help us operate the service.",
        "We retain personal data only as long as necessary for the purposes described in this notice or as required by law.",
        "You may exercise rights to access, rectification, erasure, restriction, portability, and objection by contacting the privacy team.",
        "We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.",
        "You may complain to a supervisory authority, and our data protection officer can be contacted through the privacy office.",
      ].join(" "),
    },
    "/policies/article13-accordions": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. This page presents disclosures in expandable sections.",
        "We collect and process personal data to provide services, improve security, personalize content, and measure performance.",
        "The controller can be contacted at privacy@example.test and the privacy office handles data protection requests.",
        "We rely on consent, contract, legal obligation, and legitimate interests as lawful bases for processing depending on context.",
        "Recipients include service providers, processors, analytics providers, advertising partners, and affiliates that help operate the service.",
        "We retain personal data only as long as necessary for the purposes described in this notice or as required by law.",
        "You may exercise rights to access, rectification, erasure, restriction, portability, and objection by contacting the privacy team.",
        "We may transfer personal data outside the European Economic Area using standard contractual clauses.",
        "You may complain to a supervisory authority about our handling of personal data.",
      ].join(" "),
    },
    "/policies/international-transfer-recipient-safeguards": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. We explain how personal information is collected, used, shared, retained, and protected.",
        "We share personal information with third parties, service providers, and business partners for the purposes described in this notice.",
        "These third parties may be in the Netherlands as well as within other countries in the European Economic Area (EEA).",
        "Sometimes they may also be outside the EEA.",
        "We have concluded agreements with our service providers and business partners, to ensure that your personal information is protected, both within and outside the EEA.",
        "You may contact the privacy team to exercise rights to access, correction, deletion, portability, restriction, and objection.",
      ].join(" "),
    },
    "/policies/google-script-noise": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. This policy explains how we collect, use, retain, share, and protect personal information.",
        "We use personal information to provide services, maintain security, personalize content, measure performance, and improve our products.",
        "Legal basis. We process personal data with consent, when necessary for a contract, for legitimate interests, and when required by law.",
        "Recipients include service providers, processors, analytics providers, advertising partners, and affiliates that help operate the service.",
        "Retention. We retain personal information only as long as necessary for the purposes described in this notice or as required by law.",
        "Your rights. You have the right to access, delete, rectify, object to, restrict, and port your personal data by contacting the privacy team.",
        "Transfers. We may process information on servers outside your country using adequacy decisions or standard contractual clauses.",
        "Contact us. The controller and privacy office can be contacted at privacy@example.test, and you may complain to a supervisory authority.",
      ].join(" "),
    },
    "/policies/google-script-only": {
      title: "Privacy Policy",
      body: ";this.gbar_={CONFIG:[[[0,\"www.gstatic.com\",null,\"0\",null,null,0],[]]]};_.z=function(a,b){Object.defineProperties(a,b)};var c=function(){return {privacy:true, rights:Object.keys({access:1})}}; Copyright The Closure Library;",
    },
    "/policies/client-challenge": {
      title: "Client Challenge",
      body: "Client Challenge A required part of this site couldn’t load. This may be due to a browser extension, network issues, or browser settings. Please check your connection, disable any ad blockers, or try using a different browser.",
    },
    "/policies/french-captcha-challenge": {
      title: "Politique de confidentialité",
      body: "Entrez les caractères affichés dans l'image ci-dessous : Télécharger le CAPTCHA audio Réponse Soumettre",
    },
    "/policies/google-like-late-sections": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy - Privacy & Terms. Overview Privacy Policy Terms of Service Technologies FAQ Introduction Information we collect Why we collect data Your privacy controls Sharing your information Keeping your information Exporting and deleting your information Retaining your information Data transfers Compliance and cooperation with regulators.",
        "This policy explains that we collect information you provide, information created when you use services, and information from partners.",
        "We use information to provide services, maintain and improve products, protect people from abuse, measure performance, personalize content, and show personalized ads.",
        "General service information continues here with account settings, product updates, support, communications, security practices, and public documentation. This filler keeps the strongest disclosures away from the opening and navigation text so section-targeted extraction has to find the later policy body.",
        "More explanatory material describes how people can manage preferences, choose product settings, review saved activity, and understand how services work across devices. This is normal policy prose and not JavaScript configuration.",
        "Your privacy controls. You can review and update important privacy controls, including activity controls, ad settings, and personalization settings. You can also visit My Activity to review information associated with your account.",
        "Exporting and deleting your information. You can export a copy of content in your account using Google Takeout, delete your information, remove content, and request that we remove or correct information in certain cases.",
        "Retaining your information. We retain different types of information for different periods depending on how it is used. Some data is deleted or anonymized automatically, some information is kept until you remove it, and some records are retained as long as necessary for legal purposes, security, fraud, and abuse prevention.",
        "Data transfers. We maintain servers around the world and may process your information on servers located outside the country where you live. We rely on legal frameworks relating to the transfer of data, including data privacy frameworks and other safeguards where data protection laws vary among countries.",
        "Compliance and cooperation with regulators. We regularly review this privacy policy and process formal written complaints. We work with regulatory authorities, including local data protection authorities, to resolve unresolved complaints.",
        "Automated systems. We use automated systems and algorithms to recognize patterns, provide customized search results, tailor services, and show personalized ads. This section does not say decisions are made solely by automated processing with legal or similarly significant effects.",
        "European requirements. Google LLC and Google Ireland Limited answer questions about this policy. People can contact Google about privacy questions, and the data protection office can route privacy requests to the appropriate team.",
      ].join(" "),
    },
    "/policies/mature-real-prose": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. We collect personal information that you provide and information created when you use our services.",
        "We use personal information to provide services, secure accounts, personalize content, measure advertising performance, and improve our products.",
        "We rely on consent, performance of a contract, legitimate interests, legal obligations, and other lawful bases depending on the processing context.",
        "We share information with service providers, processors, analytics providers, advertising partners, affiliates, and public authorities when required by law.",
        "We retain personal data only for as long as necessary for the purposes described in this notice, unless a longer period is required by law.",
        "You may exercise rights to access, correction, deletion, erasure, portability, restriction, and objection by contacting our privacy team.",
        "We may transfer personal data outside the European Economic Area using adequacy decisions, standard contractual clauses, or comparable safeguards.",
        "You may contact our data protection officer and may complain to a supervisory authority if you have concerns about our handling of personal data.",
      ].join(" "),
    },
    "/privacy": {
      title: "Privacy Policy",
      body: "Last updated: May 1, 2026. We use cookies for analytics and advertising. Our service providers include Google Analytics and Meta for measurement and advertising.",
    },
    "/privacy-policy": {
      title: "Privacy Policy",
      body: "Effective date: May 1, 2026. We describe cookies, analytics, advertising, and privacy choices for visitors.",
    },
    "/privacy-policy/": {
      title: "Privacy Policy",
      body: "Effective date: May 1, 2026. We describe cookies, analytics, advertising, and privacy choices for visitors.",
    },
    "/privacy-notice": {
      title: "Privacy Notice",
      body: "Caltech Privacy Notice. We describe the personal information we collect, the purposes for processing, cookies, analytics, and privacy contact information.",
    },
    "/datenschutz": {
      title: "Datenschutzerklärung",
      body: "Datenschutzerklärung. Wir beschreiben die Verarbeitung personenbezogener Daten, Zwecke, Rechtsgrundlagen, Empfänger, Speicherdauer und Datenschutzrechte.",
    },
    "/politique-de-confidentialite": {
      title: "Politique de confidentialité",
      body: "Politique de confidentialité. Nous décrivons le traitement des données personnelles, les finalités, la base juridique, les destinataires, la durée de conservation et vos droits.",
    },
    "/informativa-privacy": {
      title: "Informativa sulla privacy",
      body: "Informativa sulla privacy. Descriviamo il trattamento dei dati personali, le finalità, la base giuridica, i destinatari, la conservazione e i diritti dell'interessato.",
    },
    "/privacybeleid": {
      title: "Privacybeleid",
      body: "Privacybeleid. Wij beschrijven de verwerking van persoonsgegevens, doeleinden, rechtsgrondslag, ontvangers, bewaartermijnen en uw rechten.",
    },
    "/polityka-prywatnosci": {
      title: "Polityka prywatności",
      body: "Polityka prywatności. Opisujemy przetwarzanie danych osobowych, cele, podstawę prawną, odbiorców, okres przechowywania i prawa osób, których dane dotyczą.",
    },
    "/help/privacy": {
      title: "Privacy Policy",
      body: "Ford Privacy Policy. We explain how we collect, use, disclose, and retain personal information. We use cookies and analytics, and privacy choices are available.",
    },
    "/legal/privacy-cookie-statement": {
      title: "Privacy and Cookie Statement",
      body: "IKEA Privacy and Cookie Statement. We use cookies, analytics, advertising identifiers, and similar technologies. Cookie settings and privacy choices are available.",
    },
    "/legal/privacy-cookie-statement/": {
      title: "Privacy and Cookie Statement",
      body: "IKEA Privacy and Cookie Statement. We use cookies, analytics, advertising identifiers, and similar technologies. Cookie settings and privacy choices are available.",
    },
    "/global/en/legal/privacy-cookie-statement": {
      title: "Privacy and Cookie Statement",
      body: "IKEA Privacy and Cookie Statement. We use cookies, analytics, advertising identifiers, and similar technologies. Cookie settings and privacy choices are available.",
    },
    "/global/en/legal/privacy-cookie-statement/": {
      title: "Privacy and Cookie Statement",
      body: "IKEA Privacy and Cookie Statement. We use cookies, analytics, advertising identifiers, and similar technologies. Cookie settings and privacy choices are available.",
    },
    "/en-us/about-nvidia/privacy-policy": {
      title: "NVIDIA Privacy Policy",
      body: "NVIDIA Privacy Policy. We describe personal data collection, cookies, analytics, advertising, privacy choices, and contact information.",
    },
    "/en-us/about-nvidia/privacy-policy/": {
      title: "NVIDIA Privacy Policy",
      body: "NVIDIA Privacy Policy. We describe personal data collection, cookies, analytics, advertising, privacy choices, and contact information.",
    },
    "/en-us/about-nvidia/privacy-center": {
      title: "NVIDIA Privacy Center",
      body: "NVIDIA Privacy Center. Visitors can manage privacy choices and cookie preferences.",
    },
    "/en-us/about-nvidia/privacy-center/": {
      title: "NVIDIA Privacy Center",
      body: "NVIDIA Privacy Center. Visitors can manage privacy choices and cookie preferences.",
    },
    "/policies/rights-only": {
      title: "Privacy Policy",
      body: "Privacy Policy. You have the right to access, delete, erase, rectify, restrict, port, or object to certain processing of your personal data. Contact privacy@example.test to exercise your rights.",
    },
    "/policies/cookies": {
      title: "Cookie Policy",
      body: "Cookie Policy. We use cookies, analytics cookies, advertising cookies, cookie settings, and cookie preferences. You may withdraw consent through manage preferences.",
    },
    "/policies/nl-cookiebeleid": {
      title: "Cookiebeleid",
      body: "Cookiebeleid. We gebruiken cookies voor analyse en advertenties en bieden cookie-instellingen.",
    },
    "/policies/pl-cookies": {
      title: "Polityka plików cookie",
      body: "Polityka plików cookie. Używamy plików cookie do analityki i reklamy oraz udostępniamy ustawienia plików cookie.",
    },
    "/cookie-policy": {
      title: "Cookie Policy",
      body: "Cookie Policy. Cookies, analytics, advertising, and cookie settings are described here.",
    },
    "/privacy-choices": {
      title: "Your Privacy Choices",
      body: "Your Privacy Choices. You may opt out of sale or share, targeted advertising, and interest-based advertising. Global Privacy Control signals are honored where required.",
    },
    "/state-privacy-rights": {
      title: "State Privacy Rights",
      body: "State Privacy Rights. California and other state residents may access, delete, correct, and opt out of sale or share of personal information and targeted advertising.",
    },
    "/privacy-center": {
      title: "Privacy Center",
      body: "Privacy Center. Visitors can review privacy settings, manage cookie preferences, and find privacy choices.",
    },
    "/privacy-center-shell": {
      title: "Privacy Center",
      body: "Privacy Center. Visitors can review privacy settings, manage cookie preferences, and find privacy choices.",
    },
    "/policies/canonical-privacy": {
      title: "Canonical Privacy Policy",
      body: [
        "Canonical Privacy Policy. We collect and process personal data to provide services, personalize content, measure performance, and improve security.",
        "You can contact the controller at privacy@example.test or by writing to the privacy team.",
        "We rely on consent, contract, legal obligation, and legitimate interests as lawful bases for processing depending on context.",
        "Recipients include service providers, processors, analytics providers, advertising partners, and affiliates that help us operate the service.",
        "We retain personal data only as long as necessary for the purposes described in this notice or as required by law.",
        "You may exercise rights to access, rectification, erasure, restriction, portability, and objection by contacting the privacy team.",
        "We may transfer personal data outside the European Economic Area using adequacy decisions or standard contractual clauses.",
        "You may complain to a supervisory authority, and our data protection officer can be contacted through the privacy office.",
        "Additional canonical privacy text repeats ordinary policy context about account preferences, support workflows, website diagnostics, analytics, communications, affiliates, international safeguards, retention schedules, and choices so the retained deterministic excerpt exceeds the minimum usable text threshold for Article 13 review.",
        "More canonical privacy text describes categories of personal information, sources, purposes, recipients, retention periods, data subject rights, complaint routes, and controller contact details without adding unrelated navigation or footer noise.",
      ].join(" "),
    },
    "/privacy-control/onetrust/choices": {
      title: "Your Privacy Choices",
      body: "Your Privacy Choices preference center. This simulated OneTrust control lets visitors opt out of sale or share and manage cookie preferences.",
    },
    "/do-not-sell-or-share": {
      title: "Do Not Sell or Share",
      body: "Do Not Sell or Share My Personal Information. California residents can opt out of sale or share of personal information and targeted advertising.",
    },
    "/notice-at-collection": {
      title: "Notice at Collection",
      body: "Notice at Collection. We collect identifiers, commercial information, internet activity, sensitive personal information, and retain data for stated business purposes.",
    },
    "/policies/vendors": {
      title: "Privacy Policy Vendors",
      body: "Our advertising and analytics partners may include Google Analytics, Google Ads, DoubleClick, Meta, Microsoft Clarity, Hotjar, FullStory, LiveRamp, The Trade Desk, Taboola, Outbrain, OneTrust, Cookiebot, Didomi, and TrustArc.",
    },
    "/policies/webmd-like-privacy": {
      title: "Privacy Policy",
      body: "Privacy Policy. We use cookies and targeted advertising. Please review our Cookie Policy and State Privacy Policy for privacy choices.",
    },
    "/policies/webmd-like-state-privacy": {
      title: "State Privacy Policy",
      body: "State Privacy Policy. Information we collect includes identifiers, internet activity, and sensitive personal information. Categories of sources and business purposes are described here. You may opt out by selecting your preferences within the cookie banner, by clicking the Do Not Sell or Share My Personal Information link, or by enabling an opt-out preference signal in your browser. The cookie banner will automatically read such signals and comply with your preferences for targeted advertising choices.",
    },
    "/policies/webmd-like-cookie-policy": {
      title: "Cookie Policy",
      body: "Cookie Policy. We use cookies, analytics cookies, advertising cookies, cookie settings, and privacy choices for interest-based advertising.",
    },
    "/policies/gpc": {
      title: "Privacy Notice",
      body: "Global Privacy Control. We process GPC opt-out preference signals as a request to opt out of sale or share and targeted advertising.",
    },
    "/policies/gpc-late": {
      title: "Privacy Policy",
      body: [
        "Last updated: May 1, 2026. We use cookies for analytics and advertising.",
        "Our service providers include Google Analytics and Meta for measurement and advertising.",
        "This neutral policy overview paragraph is intentionally long so the first cookie and advertising terms appear far away from the later opt-out preference signal language used for excerpt anchoring.",
        "Additional neutral text describes account settings, contact methods, service operations, retention, and ordinary website functionality without adding another privacy-control phrase.",
        "Global Privacy Control signals are processed as opt-out preference signals for sale or share and targeted advertising choices.",
      ].join(" "),
    },
    "/policies/noisy-privacy": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. We collect and process personal data to provide services, personalize content, measure performance, and improve security.",
        "You can contact the controller at privacy@example.test or by writing to the privacy team.",
        "We rely on consent, contract, legal obligation, and legitimate interests as lawful bases for processing depending on context.",
        "Recipients include service providers, processors, analytics providers, advertising partners, and affiliates that help us operate the service.",
        "We retain personal data only as long as necessary for the purposes described in this notice or as required by law.",
        "You may exercise rights to access, rectification, erasure, restriction, portability, and objection by contacting the privacy team.",
        "We may transfer personal data outside the European Economic Area using standard contractual clauses.",
        "You may complain to a supervisory authority, and our data protection officer can be contacted through the privacy office.",
        "Additional policy body text repeats categories of personal data, processing purposes, recipients, retention periods, international transfers, rights, complaint channels, privacy office contacts, cookies, analytics, advertising, and security controls so the policy body is long enough for deterministic extraction.",
      ].join(" "),
    },
    "/policies/session-replay": {
      title: "Privacy Notice",
      body: "We may use session replay and behavioral analytics tools to understand how visitors use pages and forms. You may opt out through cookie settings.",
    },
    "/policies/ai": {
      title: "AI Disclosures",
      body: "Artificial intelligence features may summarize account content. Some output may include AI-generated content and automated decision support for internal operations.",
    },
    "/b2b/ai-technology": {
      title: "AI Technology",
      body: "AI technology information for advertisers and newsroom partners.",
    },
    "/en-us/ai-data-science": {
      title: "AI Data Science",
      body: "NVIDIA AI data science product information.",
    },
    "/en-us/ai-data-science/": {
      title: "AI Data Science",
      body: "NVIDIA AI data science product information.",
    },
    "/en-eu/gtc/pricing/": {
      title: "GTC Pricing",
      body: "Conference pricing and registration terms.",
    },
    "/gift-subscription-terms": {
      title: "Gift Subscription Terms",
      body: "Gift subscription terms for this fixture publisher.",
    },
    "/subscriber-terms-and-conditions": {
      title: "Subscriber Terms and Conditions",
      body: "Subscriber terms and conditions for this fixture publisher.",
    },
    "/policies/onetrust-shell": {
      title: "WBD Privacy Center b2c",
      body: "Processing Error. Close Privacy Center. Our Privacy Approach Privacy Policy Terms of Use Cookie Settings. OneTrust NoticeApi LoadNotices shell.",
    },
    "/policies/onetrust-index-shell": {
      title: "WBD Privacy Center b2c",
      body: "Processing Error. Close Privacy Center. Our Privacy Approach Privacy Policy Terms of Use Cookie Settings. OneTrust NoticeApi LoadNotices index shell.",
    },
    "/policies/onetrust-final-shell": {
      title: "en-us | WBD Privacy Center",
      body: "Processing Error. Close Privacy Center. Nested OneTrust NoticeApi LoadNotices shell.",
    },
    "/policies/privacy-index": {
      title: "Privacy Policy",
      body: "Select the privacy notice that applies to this service.",
    },
    "/policies/website-privacy-index": {
      title: "Privacy Notices",
      body: [
        "Privacy at Example Test. We are committed to protecting personal information and explain how the university handles data across its activities.",
        "This privacy hub introduces our approach, governance, security, accountability, and contact routes. Select the privacy notice that applies to you for the full disclosures relevant to that relationship.",
        "Separate notices cover students, staff, research participants, visitors, website users, cookies, events, and other university services.",
      ].join(" ").repeat(4),
    },
    "/policies/website-and-cookies-privacy": {
      title: "Website and Cookies Privacy Notice",
      body: [
        "Website and Cookies Privacy Notice. Example Test is the controller for personal information collected through this website.",
        "We use personal information to operate and improve the website, answer enquiries, measure usage, and provide requested services.",
        "Our legal bases include legitimate interests, consent, contract, and compliance with legal obligations.",
        "We share information with hosting, analytics, security, and professional service providers.",
        "We do not keep data longer than is necessary and follow the University's retention schedule.",
        "You may request access, correction, deletion, restriction, portability, or object to processing.",
        "We maintain a Data Controller registration with the Information Commissioner's Office. Contact our data protection officer at privacy@example.test. If you are not satisfied, you may submit a complaint to the Information Commissioner&rsquo;s Office.",
        "Additional explanatory text describes the controller, purposes, legal bases, recipients, retention, individual rights, and complaint routes for website visitors.",
      ].join(" ").repeat(4),
    },
    "/policies/student-privacy": {
      title: "Student Privacy Notice",
      body: "This separate notice applies to enrolled students and academic records.",
    },
    "/policies/privacy-notice-current": {
      title: "Privacy Policy",
      body: [
        "Privacy Policy. This notice explains how Example Test collects and processes personal data.",
        "We process account, contact, device, and usage information to provide the service, secure accounts, communicate with users, and improve our products.",
        "Depending on the activity, our legal bases include contract, consent, legal obligations, and legitimate interests.",
        "Recipients may include hosting providers, payment processors, analytics providers, professional advisers, and public authorities where required.",
        "We retain personal data only for as long as needed for the purposes described in this notice and applicable legal requirements.",
        "Individuals may request access, correction, deletion, restriction, portability, or object to certain processing by contacting privacy@example.test.",
        "International transfers may use adequacy decisions or standard contractual clauses.",
        "You may contact our data protection officer and lodge a complaint with a supervisory authority.",
        "Additional policy context describes controller identity, contact routes, data categories, sources, service purposes, recipients, retention criteria, security practices, transfers, individual rights, complaint channels, and policy updates.",
        "Further explanatory text repeats the target-owned privacy notice context so the retained document is long enough for deterministic bounded policy extraction and review.",
      ].join(" ").repeat(3),
    },
    "/policies/privacy-notice-legacy": {
      title: "Archived Privacy Policy",
      body: "Archived privacy policy retained for historical reference only.",
    },
    "/accessibility": {
      title: "Accessibility Statement",
      body: "Accessibility statement. Contact us if you experience barriers accessing our public website.",
    },
    "/terms": {
      title: "Terms",
      body: "Terms of use for this fixture site.",
    },
  };
  const doc = docs[pathname];
  if (!doc) {
    return undefined;
  }
  if (pathname === "/policies/privacy-index") {
    return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <a href="/policies/privacy-notice-legacy">Previous Privacy Policy</a>
      <a href="/policies/privacy-notice-current">Privacy Policy for this service</a>
      <a href="/support/privacy-faq">Privacy FAQ</a>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/website-privacy-index") {
    return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <a href="/policies/student-privacy">Student Privacy Notice</a>
      <a href="/policies/website-and-cookies-privacy">Website and Cookies</a>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/privacy-notice-legacy") {
    return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title></head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <a href="/policies/privacy-notice-current">Open the current Privacy Policy</a>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/privacy-with-third-party-links") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <p><a href="/policies/cookies">Cookie Policy</a></p>
      <p><a href="https://www.facebook.com/privacy/policy/">Facebook Privacy Policy</a></p>
      <p><a href="https://www.linkedin.com/legal/privacy-policy">LinkedIn Privacy Policy</a></p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/onetrust-shell") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
    <script>window.OneTrust = { NoticeApi: { LoadNotices() {} } }; OneTrust.NoticeApi.LoadNotices(["/onetrust/notice-shell.json"], true, "en-us", "false");</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/onetrust-index-shell") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
    <script>window.OneTrust = { NoticeApi: { LoadNotices() {} } }; OneTrust.NoticeApi.LoadNotices(["/onetrust/index-manifest.json"], true, "en-us", "false");</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/onetrust-final-shell") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
    <script>window.OneTrust = { NoticeApi: { LoadNotices() {} } }; OneTrust.NoticeApi.LoadNotices(["/onetrust/final-manifest.json"], true, "en-us", "false");</script>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/webmd-like-privacy") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <p><a href="/policies/webmd-like-cookie-policy">Cookie Policy</a></p>
      <p><a href="/policies/webmd-like-state-privacy">State Privacy Policy</a></p>
    </main>
</body>
</html>`;
  }
  if (pathname === "/privacy-center-shell") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main class="privacy-center-shell">
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <p><a href="/policies/canonical-privacy">Privacy Policy</a></p>
      <p><a href="/privacy-choices">Your Privacy Choices</a></p>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/article13-accordions") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main class="privacy-policy">
      <h1>${escapeHtml(doc.title)}</h1>
      <p>Privacy Policy. This page presents disclosures in expandable sections.</p>
      <details>
        <summary>Controller and purposes</summary>
        <p>We collect and process personal data to provide services, improve security, personalize content, and measure performance.</p>
        <p>The controller can be contacted at privacy@example.test and the privacy office handles data protection requests.</p>
      </details>
      <section class="policy-accordion-panel" aria-expanded="false">
        <h2>Legal bases and recipients</h2>
        <p>We rely on consent, contract, legal obligation, and legitimate interests as lawful bases for processing depending on context.</p>
        <p>Recipients include service providers, processors, analytics providers, advertising partners, and affiliates that help operate the service.</p>
      </section>
      <details>
        <summary>Retention, rights, and transfers</summary>
        <p>We retain personal data only as long as necessary for the purposes described in this notice or as required by law.</p>
        <p>You may exercise rights to access, rectification, erasure, restriction, portability, and objection by contacting the privacy team.</p>
        <p>We may transfer personal data outside the European Economic Area using standard contractual clauses.</p>
        <p>You may complain to a supervisory authority about our handling of personal data.</p>
      </details>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/noisy-privacy") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <header>
      <p>Global navigation login subscribe sports entertainment weather stocks video newsletter.</p>
      <p>Repeated header noise repeated header noise repeated header noise repeated header noise repeated header noise.</p>
    </header>
    <nav>
      <a href="/sports">Sports</a>
      <a href="/weather">Weather</a>
      <a href="/shopping">Shopping</a>
      <a href="/videos">Videos</a>
    </nav>
    <main class="privacy-policy-content">
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
    </main>
    <footer>
      <p>Footer links about careers ads newsletters site map contact help coupons subscriptions.</p>
      <p>Repeated footer noise repeated footer noise repeated footer noise repeated footer noise repeated footer noise.</p>
    </footer>
</body>
</html>`;
  }
  if (pathname === "/policies/google-script-noise") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
    <script>;this.gbar_={CONFIG:[[[0,"www.gstatic.com",null,"0",null,null,0],[]]]};_.z=function(a,b){Object.defineProperties(a,b)};var noisy=function(){return "privacy rights data"};</script>
  </head>
  <body>
    <main class="privacy-policy">
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <pre>;this.gbar_={CONFIG:[[[0,"www.gstatic.com"]]]}; Copyright The Closure Library;</pre>
    </main>
  </body>
</html>`;
  }
  if (pathname === "/policies/google-script-only") {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main class="privacy-policy">
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${doc.body}</p>
    </main>
  </body>
</html>`;
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(doc.title)}</h1>
      <p>${escapeHtml(doc.body)}</p>
      <p>This long filler paragraph exists only to prove the scanner keeps a bounded excerpt instead of storing the entire policy page in ReviewResult. Additional neutral fixture text repeats operational details without user-specific values or raw form data.</p>
    </main>
  </body>
</html>`;
}

function createTextPdf(text: string): Buffer {
  const lines = text.split(/\r?\n/).flatMap((line) => chunkPdfLine(line, 88));
  const stream = [
    "BT",
    "/F1 10 Tf",
    "14 TL",
    "72 720 Td",
    ...lines.map((line, index) => `${index === 0 ? "" : "T* "}${pdfString(line)} Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

function chunkPdfLine(value: string, maxLength: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [""];
}

function pdfString(value: string): string {
  return `(${value.replace(/[\\()]/g, "\\$&")})`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
