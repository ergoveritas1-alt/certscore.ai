# chime.com

## 1. Executive summary
- overall testing status: completed for the configured scenarios
- strongest observed risks: possible pre-consent tracking observed; reject path appears less easy than accept path; browser-level privacy signal did not appear to change first-load behavior
- confidence level: medium
- manual review recommended: yes

## 2. Consent UX scorecard
- banner present: yes
- reject-all first layer: no
- accept/reject click parity: inconclusive
- equal prominence assessment: inconclusive
- dark-pattern indicators observed: reject not detected on first layer

## 3. Pre-consent tracking summary
- cookies set before interaction: X-AB @ sc-static.net; ajs_anonymous_id @ .chime.com; t_gid @ .taboola.com; t_pt_gid @ .taboola.com; _ttp @ .tiktok.com; _ga @ .chime.com; IDE @ .doubleclick.net; _ga_9G6X89ETJB @ .chime.com; _fbp @ .chime.com; _ttp @ .chime.com; ad-id @ .amazon-adsystem.com; ad-privacy @ .amazon-adsystem.com
- storage entries created before interaction: __fmpix_uid=1-mm7xs0ft-mn7wc1l7; _uetvid_exp=Tue, 20 Apr 2027 19:59:36 GMT; _applovin_pixel_version=a/1.5.21; __nt_anonymous_id__="09e40bc4ffe3d834365720a0a935486d5a723b26fac94b8d697e77c9417...; _gcl_ls={"schema":"gcl","version":1,"gcl_ctr":{"value":{"value":1,"t...; _uetsid=50cf1630294e11f19b6f255eaed6cd4c; __nt_profile__={"id":"09e40bc4ffe3d834365720a0a935486d5a723b26fac94b8d697e7...; lastExternalReferrerTime=1774555176605; _uetsid_exp=Fri, 27 Mar 2026 19:59:36 GMT; CHIME-DEVICE-ID=f30f4517-eb16-4935-a62c-8dce154b20a4; _uetvid=50cf0e60294e11f1863eff518daec928; lastExternalReferrer=empty; ajs_anonymous_id="f30f4517-eb16-4935-a62c-8dce154b20a4"; __nt_experiences__=[{"experienceId":"3uzele1VLgkuBpzXSLZYnQ","variantIndex":1,"...; ajs_user_id=null; tt_sessionId="50ae6ebe-294e-11f1-9f0e-946dae3c9d56::WvnksVpwfT6W5qSr5PuQ"; tt_pixel_session_index={"index":0,"main":0}; tt_appInfo={"platform":"pc"}; _axsid=08957e35-0204-4c99-8bca-47c5fa0f9027
- non-essential requests before interaction: https://www.chime.com/_assets_cdn/_next/static/chunks/0-af6ofrg3la_.js; https://www.chime.com/_ctf-img/ao7gxs2zk32d/qUvG7SNrSfarbmefhFk52/d5fd6926b454a6e9bbff842cf7670c7d/desktop_-_fee_free_banking.webp?fm=webp&w=640&h=640&fit=fill&q=50; https://cdn.segment.com/analytics.js/v1/89nms3o7yr/analytics.min.js; https://cdn.segment.com/v1/projects/89nms3o7yr/settings; https://www.googletagmanager.com/gtm.js?id=GTM-5K2HFZTT; https://cdn.segment.com/v1/projects/89nms3o7yr/settings; https://cdn.segment.com/analytics-next/bundles/ajs-destination.bundle.8e6b895db75187c55313.js; https://cdn.segment.com/analytics-next/bundles/schemaFilter.bundle.1b218d13fed021531d4e.js; https://cdn.segment.com/next-integrations/actions/braze-cloud-plugins/c3dbe2dde9d1804663f0.js; https://cdn.segment.com/next-integrations/actions/3962/1faa179dfb20d0a3f5a0.js; https://cdn.segment.com/next-integrations/integrations/google-tag-manager/2.5.3/google-tag-manager.dynamic.js.gz; https://api.segment.io/v1/p
- likely vendors observed: Amazon Ads; AppNexus / Xandr; DoubleClick; Google Analytics; Google Tag Manager; Meta / Facebook; Segment; Snap; TikTok

## 4. Reject-path effectiveness summary
- what changed after reject: 0 non-essential cookie(s) no longer present after reject; 116 fewer likely non-essential request(s) after reject
- what still fired after reject: none classified with current rules
- whether refresh preserved reject outcome: tracking-like activity still appeared or refresh evidence was inconclusive

## 5. Findings list
### F001 Possible pre-consent tracking signals on first load
- severity: high
- observation: On the fresh first-load scenario, network or storage activity matching likely analytics or advertising vendors was observed before any consent interaction was completed.
- whyThisMatters: If the activity is non-essential, reviewers typically expect it to be suppressed until a valid positive choice is completed.
- confidenceScore: 0.87
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-59-31.729Z/chime-com/fresh_visit/first-load.png; /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-59-31.729Z/chime-com/fresh_visit/banner.png
- uiText: Chime is a fintech, not a bank. Banking services are provided by our bank partners.⁠Close
- cookies: X-AB @ sc-static.net; ajs_anonymous_id @ .chime.com; t_gid @ .taboola.com; t_pt_gid @ .taboola.com; _ttp @ .tiktok.com; _ga @ .chime.com; IDE @ .doubleclick.net; _ga_9G6X89ETJB @ .chime.com; _fbp @ .chime.com; _ttp @ .chime.com; ad-id @ .amazon-adsystem.com; ad-privacy @ .amazon-adsystem.com
- requests: https://www.chime.com/_assets_cdn/_next/static/chunks/0-af6ofrg3la_.js; https://www.chime.com/_ctf-img/ao7gxs2zk32d/qUvG7SNrSfarbmefhFk52/d5fd6926b454a6e9bbff842cf7670c7d/desktop_-_fee_free_banking.webp?fm=webp&w=640&h=640&fit=fill&q=50; https://cdn.segment.com/analytics.js/v1/89nms3o7yr/analytics.min.js; https://cdn.segment.com/v1/projects/89nms3o7yr/settings; https://www.googletagmanager.com/gtm.js?id=GTM-5K2HFZTT; https://cdn.segment.com/v1/projects/89nms3o7yr/settings; https://cdn.segment.com/analytics-next/bundles/ajs-destination.bundle.8e6b895db75187c55313.js; https://cdn.segment.com/analytics-next/bundles/schemaFilter.bundle.1b218d13fed021531d4e.js; https://cdn.segment.com/next-integrations/actions/braze-cloud-plugins/c3dbe2dde9d1804663f0.js; https://cdn.segment.com/next-integrations/actions/3962/1faa179dfb20d0a3f5a0.js; https://cdn.segment.com/next-integrations/integrations/google-tag-manager/2.5.3/google-tag-manager.dynamic.js.gz; https://api.segment.io/v1/p
- storage: __fmpix_uid=1-mm7xs0ft-mn7wc1l7; _uetvid_exp=Tue, 20 Apr 2027 19:59:36 GMT; _applovin_pixel_version=a/1.5.21; __nt_anonymous_id__="09e40bc4ffe3d834365720a0a935486d5a723b26fac94b8d697e77c9417...; _gcl_ls={"schema":"gcl","version":1,"gcl_ctr":{"value":{"value":1,"t...; _uetsid=50cf1630294e11f19b6f255eaed6cd4c; __nt_profile__={"id":"09e40bc4ffe3d834365720a0a935486d5a723b26fac94b8d697e7...; lastExternalReferrerTime=1774555176605; _uetsid_exp=Fri, 27 Mar 2026 19:59:36 GMT; CHIME-DEVICE-ID=f30f4517-eb16-4935-a62c-8dce154b20a4; _uetvid=50cf0e60294e11f1863eff518daec928; lastExternalReferrer=empty; ajs_anonymous_id="f30f4517-eb16-4935-a62c-8dce154b20a4"; __nt_experiences__=[{"experienceId":"3uzele1VLgkuBpzXSLZYnQ","variantIndex":1,"...; ajs_user_id=null; tt_sessionId="50ae6ebe-294e-11f1-9f0e-946dae3c9d56::WvnksVpwfT6W5qSr5PuQ"; tt_pixel_session_index={"index":0,"main":0}; tt_appInfo={"platform":"pc"}; _axsid=08957e35-0204-4c99-8bca-47c5fa0f9027
- pageUrls: https://www.chime.com/
- conservative wording: possible pre-consent tracking observed
- recommended next manual check: Confirm whether each retained request or identifier is genuinely non-essential in the tested region and whether any server-side gating explains the activity.

### F002 Reject path appears less direct than accept path
- severity: medium
- observation: A visible first-layer reject-all control was not detected, while accept or manage controls were detected on the initial consent surface.
- whyThisMatters: A deeper or less visible reject path can materially steer visitors toward acceptance even when a formal opt-out path exists.
- confidenceScore: 0.84
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-59-31.729Z/chime-com/fresh_visit/banner.png
- uiText: Chime is a fintech, not a bank. Banking services are provided by our bank partners.⁠Close; No interaction wait completed for 12000 ms.
- cookies: none
- requests: none
- storage: none
- pageUrls: https://www.chime.com/
- conservative wording: reject path appears less easy than accept path
- recommended next manual check: Re-run interactively in the same region and confirm whether reject exists on hover, in a secondary tab, or only after expanding settings.

### F005 Browser-level privacy signal effect not evident
- severity: low
- observation: In the signal-enabled session, first-load tracking signals did not show a clear reduction relative to the control session.
- whyThisMatters: When a site represents that it honors browser-level choices, reviewers usually expect observable runtime suppression or clear confirmation.
- confidenceScore: 0.61
- screenshots: /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-59-31.729Z/chime-com/fresh_visit_gpc/first-load.png; /Users/benmasek/WC01/apps/validation-worker/artifacts/live-consent-audit/2026-03-26T19-59-31.729Z/chime-com/fresh_visit_gpc/banner.png
- uiText: Chime® is a financial technology company, not an FDIC-insured bank. Banking services provided by The Bancorp Bank, N.A. or Stride Bank, N.A., Members FDIC. Deposit insurance covers the failure of an insured bank. Certain conditions must be satisfied for pass-through deposit insurance coverage to apply.The Chime Visa® Debit Card, the secured Chime Credit Builder Visa® Credit Card, and the secured Chime Visa® Credit Card are issued by The Bancorp Bank, N.A. or Stride Bank, N.A., pursuant to a license from Visa U.S.A. Inc. and may be used everywhere Visa debit or credit cards are accepted. Please see the back of your Card for its issuing bank.Chime Checkbook: While Chime doesn’t issue personal checkbooks to write checks, Chime Checkbook gives you the freedom to send checks to anyone, anytime, from anywhere. See your issuing bank’s Deposit Account Agreement for full Chime Checkbook details.By clicking on some of the links above, you will leave the Chime website and be directed to a third-party website. The privacy practices of those third parties may differ from those of Chime. We recommend you review the privacy statements of those third party websites, as Chime is not responsible for those third parties' privacy or security practices.Opinions, advice, services, or other information or content expressed or contributed here by customers, users, or others, are those of the respective author(s) or contributor(s) and do not necessarily state or reflect those of The Bancorp Bank, N.A. and Stride Bank, N.A. (“Banks”). Banks are not responsible for the accuracy of any content provided by author(s) or contributor(s).APPLE and the Apple Logo are registered trademarks of Apple Inc. GOOGLE PLAY and the Google Play Logo are registered trademarks of Google LLC. Third-party trademarks referenced for informational purposes only; no endorsements implied.
- cookies: X-AB @ sc-static.net; ajs_anonymous_id @ .chime.com; t_gid @ .taboola.com; t_pt_gid @ .taboola.com; _ga @ .chime.com; _ga_9G6X89ETJB @ .chime.com; _ttp @ .tiktok.com; _fbp @ .chime.com; IDE @ .doubleclick.net; _ttp @ .chime.com; ad-id @ .amazon-adsystem.com; ad-privacy @ .amazon-adsystem.com
- requests: https://www.chime.com/_assets_cdn/_next/static/chunks/0-af6ofrg3la_.js; https://cdn.segment.com/v1/projects/89nms3o7yr/settings; https://cdn.segment.com/analytics.js/v1/89nms3o7yr/analytics.min.js; https://cdn.segment.com/v1/projects/89nms3o7yr/settings; https://cdn.segment.com/analytics-next/bundles/ajs-destination.bundle.8e6b895db75187c55313.js; https://www.googletagmanager.com/gtm.js?id=GTM-5K2HFZTT; https://cdn.segment.com/analytics-next/bundles/schemaFilter.bundle.1b218d13fed021531d4e.js; https://cdn.segment.com/next-integrations/actions/braze-cloud-plugins/c3dbe2dde9d1804663f0.js; https://cdn.segment.com/next-integrations/actions/3962/1faa179dfb20d0a3f5a0.js; https://cdn.segment.com/next-integrations/integrations/google-tag-manager/2.5.3/google-tag-manager.dynamic.js.gz; https://api.segment.io/v1/p; https://api.segment.io/v1/t
- storage: lastExternalReferrerTime=1774555226379; __fmpix_uid=1-g8lquhyl-mn7wd3vj; _uetvid_exp=Tue, 20 Apr 2027 20:00:26 GMT; _uetsid_exp=Fri, 27 Mar 2026 20:00:26 GMT; CHIME-DEVICE-ID=a4dc42eb-f506-40db-91f4-7cda07f140f5; _applovin_pixel_version=a/1.5.21; _uetvid=6e86b4c0294e11f18cbccbc4ce14075e; lastExternalReferrer=empty; __nt_anonymous_id__="0eb705942aee2d190b8cc441a95755e315945819d71a73915e7348fa8aa...; _gcl_ls={"schema":"gcl","version":1,"gcl_ctr":{"value":{"value":1,"t...; _uetsid=6e8696c0294e11f18895d1c4a84beeca; ajs_anonymous_id="a4dc42eb-f506-40db-91f4-7cda07f140f5"; ajs_user_id=null; tt_sessionId="6e7e701c-294e-11f1-b3e4-020017103e93::NuA9AjyASaCOpfqwZ3Vs"; tt_pixel_session_index={"index":0,"main":0}; tt_appInfo={"platform":"pc"}; _axsid=d724e700-d15f-4777-a2e3-11212ddb9726
- pageUrls: https://www.chime.com/; https://www.chime.com/
- conservative wording: browser-level privacy signal did not appear to change first-load behavior
- recommended next manual check: Check whether the site states that it honors GPC or similar browser-level signals and, if so, retest with a browser extension or alternate locale to confirm runtime handling.

## 6. Final classification
- possible pre-consent tracking

