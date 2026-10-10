# Report component interaction verification

`pnpm test:report-interactions` passes against the actual timeline, form-table/dialog and viewer-timestamp components hydrated from server markup in Chromium. Synthetic inputs and intercepted image responses are used; the harness does not navigate to any report URL, contact a site, create a scan, read credentials or mutate a database. This is independent component verification, not a bypass of the browser tool's earlier report-URL security restriction.

Verified in `America/Los_Angeles`, `Asia/Tokyo` and `UTC` browser contexts:

- UTC server fallback hydrates to the browser timezone without hydration errors, preserving the ISO machine timestamp.
- Pre-consent, limited Accept and completed Reject views switch by mouse/keyboard with their respective headings and events. Neutral storage and post-Accept activity remain neutral; the retained fixture issue appears red.
- Both form images load on demand. Close and Escape remove the dialog, restore scrolling and return focus to the correct form. Image failure renders the error state and allows a successful reopen.
- Form-specific privacy disclosure opens the associated expanded row.

The harness and fixture pass TypeScript checking. The initial harness needed its async entry point wrapped for the repository's CommonJS script execution and needed to wait for React's passive unmount cleanup before asserting restored scrolling. No application defect or application-source change was required.

Command: `pnpm test:report-interactions`. Local logs: `artifacts/after-click-form-images-20261009/report-interactions.log` and `report-interactions-typecheck.log`. This explicit local command adds no recurring infrastructure or CI cost and no dependency.

The retained report's actual browser interaction remains unverified: the owner reported that the manual check has not been performed. Automated component checks do not establish full report integration or production screenshot delivery. Earlier application full-gate receipts retain their exact original source revisions; this follow-up adds only verification tooling, a package script and this receipt.
