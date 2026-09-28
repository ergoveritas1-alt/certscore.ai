# Homepage feature showcase

The homepage Findings overview is a manually controlled, 13-part product tour. A short explanation, observed result and destination link sit on the left, with the larger report capture on the right. On narrow screens the explanation precedes the preview. A fixed-height navigation bar above the changing content holds the previous/next buttons on the left, with the slide count and name aligned right, on every screen size. The evidence toggle is labeled “JSON”. Feature selector pills and the mobile selector were removed at the owner’s request. The arrows retain the same position across slides without constraining or clipping the copy. Selected slides offer report JSON. Screenshots open in a native dialog with Escape dismissal and focus restoration. No automatic rotation, live report fetch, scan creation or model call is added to the homepage.

## Source and provenance

All new captures and retained JSON values come from the owner-requested fresh scan of `https://ergoveritas.com/test2.html`:

- Scan: `d96df06d-3e94-4896-8346-1a026d68e5af`.
- Started: 2026-09-28 15:36:36.691 UTC; completed: 15:36:44.010 UTC.
- Location: California. Scope: one starting page.
- Public report: https://certscore.ai/scan/d96df06d-3e94-4896-8346-1a026d68e5af?reviewFocus=ccpa_cpra
- Export: https://certscore.ai/api/scans/d96df06d-3e94-4896-8346-1a026d68e5af/report-export?format=json&reviewFocus=ccpa_cpra
- Original downloaded export SHA-256: `f4e77cb7414ae937a262d6b4918f1c4c80044d15cb28cdf41348678eafb9aa0f`. A later export may differ because `generatedAt` is generated at retrieval.

`apps/web/public/showcase/test2/` contains cropped, compressed browser screenshots of this public report, captured September 28, 2026. No screenshot text or results were changed. No account header, email, session identifier, raw cookie values or credentials are included. `apps/web/lib/marketing/showcase-evidence.json` retains selected export fields in their original hierarchy, with unneeded fields omitted. It is a marketing snapshot, never a report input or alternative finding projection.

The report's actual GPC result is responsive: one advertising request in the baseline, zero with GPC; five analytics/replay requests in each matched 250 ms window. It does not establish complete suppression or legal compliance. The confirmed Reject path retained eligible non-essential activity. The CCPA workpaper retained one policy with five topic passages, but no verified privacy-choice links. The tour explicitly preserves that limitation. It does not convert unverified links into observed choices or imply opt-out functionality was tested.

The MCP and REST request panels are clearly labeled usage examples. JSON previews are selected fields from the canonical report export, not claimed captures of MCP/API v2 responses. A read-only Light MCP retrieval of the browser-created scan returned ineligible/not-found; no access boundary was changed. MCP callers must use a scan accessible to their connection. Forms, hidden links and embedded frames were not observed in this sample. Full-site scanning and monitoring are described as plan-dependent capabilities, not results produced by this one-page scan.

The shared sample-report constant now points to this fresh public report. Historical methodology images and dated case studies retain their original provenance.

## Coverage

| Tour section | Features covered |
| --- | --- |
| Overview | Page score, prioritized findings, ratings, signal snapshot |
| Consent paths | CMP, first-layer Accept/Reject/Options, execution versus confirmation, after-action activity |
| Cookies & storage | Cookies, local/session storage, classification, timing, attribution, JSON evidence |
| Services & requests | Vendors/products, purposes, first/third-party relationships, policy mentions, destinations, replay/fingerprinting signals |
| Timeline | Relative timing, consent-surface sequence, observation window, geographic context |
| GPC | Verified delivery, bounded observation, matched activity comparison |
| CCPA / CPRA | Do Not Sell/Share, privacy choices, cookie settings, notice topics and source links |
| Policies | Privacy/cookie policies; purposes, basis, retention, recipients, transfers, rights; evidence-scoped policy/runtime comparison |
| Transport | HTTPS, certificates, redirects, mixed content, form transport |
| Forms & embeds | Form/field structure, checkbox settings, masked captures when available, frames, hidden outbound links |
| Share & monitor | Public reports, PDF/JSON/CSV export, plan-dependent full-site scans and monitoring |
| MCP | Light and authenticated connections, scan/status/bundle workflow, paginated evidence |
| API & SDK | REST creation/status/findings/evidence, typed SDK and documentation |

## Cost and boundaries

Ten WebP screenshots total 308,472 bytes (about 301 KiB); the evidence excerpt is about 3.5 KiB. Only the selected screenshot is requested, with normal browser caching; no image transformation service is used. At 10,000 visitors/month opening every image, approximately 3.1 GB of transfer plus 100,000 static requests is estimated below $0.50/month before caching/free allowances. Storage is negligible. Higher traffic scales proportionally; no infrastructure capacity, retention, logging, per-scan or API allowance changes are introduced. One authorized fresh scan used one existing scan allowance; no new recurring scan schedule was created.

Canonical assessment, normalized concerns, policy, unified findings and scoring are unchanged. No deployment is part of this work.

## Verification

- Browser: all 13 desktop feature buttons, selection state, next wraparound, scoped arrow navigation, JSON switching, image enlargement, Escape/Close dismissal and focus restoration.
- Mobile: 390 px viewport, feature selector, screenshot dialog and no document horizontal overflow.
- Evidence excerpt checked recursively against the downloaded canonical export; all retained values match.
- Source image dimensions and referenced asset files checked.
- AWS repository `preflight:fast` against `075a8563` and web typecheck: see completion record below.

Completion record: final `PREDEPLOY_BASE_REF=075a8563 pnpm preflight:fast` passed, including web typecheck, canonical projection parity, scan-source/allowance contracts and post-refusal release contracts (1,398 tests; zero failures). Desktop was reviewed at 1,218 px and 1,440 px, mobile at 390 px. A transient development HMR warning during JSON editing did not recur after a full reload. Browser viewport overrides were reset. Changes are local and not deployed.

Navigation refinement: removed the feature pills/mobile selector; previous/next remain at the top left and slide count/title at the top right. Renamed the preview toggle to “JSON”. Browser measurements across all 13 slides confirmed unchanged arrow coordinates on desktop and mobile, with no mobile horizontal overflow. Web typecheck passed. No added cost or deployment.
