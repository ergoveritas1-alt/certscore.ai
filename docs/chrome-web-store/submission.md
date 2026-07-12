# CertScore.ai Chrome Web Store submission

## Publisher

- Publisher account: `ben@certscore.ai`
- Public publisher name: `CertScore.ai by ErgoVeritas`
- Support email: `support@certscore.ai`
- Initial visibility: Private
- Initial trusted testers: `ben@certscore.ai`, `bmasek@gmail.com`
- Privacy policy: `https://certscore.ai/browser-extension/privacy`

## Store listing

### Name

CertScore.ai Browser Evidence

### Summary

Run a reviewer-started website scan from Chrome and add bounded browser evidence to your CertScore.ai report.

### Detailed description

CertScore.ai Browser Evidence lets a signed-in CertScore.ai reviewer run a time-bounded scan from the Chrome tab they choose.

Use it when a website behaves differently in a normal browser session or when CertScore.ai's hosted scanner cannot verify a representative public page.

After you start a scan, the extension can reload the selected page and observe bounded request metadata, cookie names and attributes, visible consent-interface evidence, browser-observed fingerprinting signals, scan timing, and a screenshot of the visible tab. It sends that evidence securely to CertScore.ai to create the requested scan report.

The extension does not capture cookie values, passwords, form entries, payment information, or browsing activity outside the reviewer-started scan window. Evidence is not sold or used for personalized advertising.

Fresh visit is optional. When selected, it clears cookies and site storage only for the chosen website before reloading it.

The extension reports observable risk signals for review. It does not provide legal certification or a compliance determination.

## Single purpose

CertScore.ai lets a signed-in reviewer run a user-initiated, time-bounded website scan from Chrome and upload bounded pre-consent request, cookie-metadata, consent-interface, fingerprinting, timing, and visible-tab screenshot evidence to the reviewer's CertScore.ai report.

## Permission justifications

### `https://certscore.ai/*` required host access

Required for the signed-in CertScore.ai web application to detect the installed extension, initiate a reviewer-requested browser scan, receive bounded progress updates, and link the resulting report. No other website is granted permanent access at installation.

### Optional `http://*/*` and `https://*/*` host access

Requested for only the target website selected by the reviewer when they start a scan. This access allows the extension to observe that site's bounded pre-consent browser evidence. If the reviewer denies the request, the scan does not run.

### `browsingData`

Used only when the reviewer explicitly enables Fresh visit. It clears cookies and browser storage for the selected target origin before reload so the requested scan can observe a fresh pre-consent state.

### `cookies`

Reads cookie names and non-value attributes for the selected target origin during the bounded scan window and observes changes. Cookie values are never captured or uploaded.

### `storage`

Stores scan progress, the first-scan data-use acknowledgment, and bounded extension state locally in Chrome.

### `tabs`

Reads the selected tab URL, reloads or opens the reviewer-selected target page, sends bounded messages to the target content script, captures the visible tab near the end of the scan, and opens the completed CertScore.ai report.

### `webRequest`

Observes request URL, hostname, method, resource type, timing, selected header names, and response status for the reviewer-selected tab during the bounded scan window. Request and response bodies are not captured.

### `windows`

Opens and focuses the small CertScore.ai progress window while a reviewer-started scan is running.

### `scripting`

Registers the packaged target-observation and fingerprint-evidence scripts only for the specific origin the reviewer approves when starting a scan. It does not download or execute remote code, and no all-sites content script is installed permanently.

## Data-use declarations

Declare the following data categories in the Privacy practices tab:

- Web history: target URL/hostname and bounded request URLs during the reviewer-started scan.
- Website content: visible consent-interface snippets and visible-tab screenshot.
- User activity: reviewer-started scan action and scan timing.
- Authentication information: the extension uses the signed-in CertScore.ai session to create the requested scan, but does not collect or upload passwords or authentication-cookie values.

Certifications:

- Data is used only to provide or improve the extension's single purpose.
- Data is not sold or transferred for unrelated purposes.
- Data is not used for creditworthiness or lending.
- Data is not used for personalized advertising.
- Human access is limited to explicit support consent, security, legal requirements, or permitted aggregated operations.

## Reviewer test instructions

1. Sign in to `https://certscore.ai` with the supplied reviewer account.
2. Open a public HTTP or HTTPS website in Chrome.
3. Select the CertScore.ai extension.
4. Read and accept the first-scan data disclosure.
5. Select **Run Browser Pre-Consent Scan**.
6. Approve access to the selected website when Chrome prompts.
7. Keep the target and CertScore.ai progress windows open for approximately 15 seconds.
8. Select **View scan report on CertScore.ai** after completion.

No consent-banner buttons are clicked by the extension.
