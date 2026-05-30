# CertScore BX01 Browser Extension

Basic Chrome MV3 extension MVP for browser-observed pre-consent evidence.

## Load locally

1. Visit `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select `apps/browser-extension`.
4. Sign in to the target CertScore web app in Chrome.
5. Open a public site, click the extension, and run a browser pre-consent scan.

The extension only runs after the user clicks the popup button. It creates a browser scan session through CertScore API routes, reloads the active tab, observes for about 15 seconds, and uploads bounded BX01 evidence. Cookie values are never captured.

The popup can be opened directly as `src/popup.html` for visual review. In that mode it shows preview data because Chrome extension APIs are unavailable outside an installed extension context.

For local API testing, set `apiBaseUrl` in `src/config.js` to `http://localhost:3000`.
