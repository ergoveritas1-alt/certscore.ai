import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";

export const redirectedPolicyText = `Privacy Policy
Cloud Security Ltd is the controller for personal information collected through our website.
We collect contact details and technical information to provide services, answer requests, and keep our systems secure.
We process personal information to perform contracts, comply with legal obligations, and pursue our legitimate security interests.
We share information with service providers that process data on our behalf under contractual safeguards.
We retain personal information only as long as necessary to provide services and comply with legal obligations.
You may request access, correction, deletion, restriction, or portability of your personal information, and object to processing.
You may withdraw consent at any time and complain to your local data protection authority.
Contact privacy@example.test for privacy questions or requests. International transfers use contractual safeguards.
California residents may request access, correction, deletion, and opt out of sale or sharing. We do not sell personal information.`;

/** A redirect alias, a denied direct homepage, and an actual observed footer route. */
export async function startRedirectedPolicyRecoveryFixture(options: {
  policyText?: string;
  policyTitle?: string;
  policyLinkText?: string;
  hubWaitForPolicy?: boolean;
  policyFails?: boolean;
  renderedBlocked?: boolean;
  footerConfig?: boolean;
  directPolicyBlocked?: boolean;
  stallPolicyLoad?: boolean;
  misdirectPolicyClick?: boolean;
  duplicatePolicyLinks?: boolean;
} = {}) {
  const requests: string[] = [];
  const pendingHubResponses = new Set<ServerResponse>();
  let signalHubRequest: (() => void) | undefined;
  const hubRequest = new Promise<void>(resolve => { signalHubRequest = resolve; });
  let policyRequestedBeforeHubClosed = false;
  let hubClosedBeforePolicy = false;
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://fixture.test").pathname;
    requests.push(pathname);
    if (pathname === "/privacy-policies-hub/" && options.hubWaitForPolicy) {
      pendingHubResponses.add(response); signalHubRequest?.();
      response.on("close", () => { if (!policyRequestedBeforeHubClosed) hubClosedBeforePolicy = true; pendingHubResponses.delete(response); });
      return;
    }
    if (pathname === "/alias") {
      response.writeHead(301, { location: "/canonical/" }); response.end(); return;
    }
    if (pathname === "/canonical/") {
      const browser = /Mozilla/.test(request.headers["user-agent"] ?? "");
      response.writeHead(browser && !options.renderedBlocked ? 200 : 403, { "content-type": "text/html" });
      const footerConfig = options.footerConfig
        ? '<script>window.didomiConfig = {"app":{"privacyPolicyURL":"/config-only-privacy"}};</script>' : "";
      const largeNavigation = options.duplicatePolicyLinks
        ? `${Array.from({ length: 300 }, (_, index) => `<a href="/resource-${index}">Resource ${index}</a>`).join("")}<a href="security-privacy/">Privacy Policy</a>` : "";
      response.end(browser && !options.renderedBlocked
        ? `<!doctype html><html lang="en"><title>Cloud Security</title><body>${largeNavigation}<main><h1>Cloud Security</h1><p>Security services for web servers. Our tools protect websites against malware and help hosting providers keep their customers secure. Learn about our products, documentation, support resources, and company information.</p></main><footer>${options.hubWaitForPolicy ? '<a href="/privacy-policies-hub/">Privacy Policy</a>' : ""}<a href="security-privacy/"${options.misdirectPolicyClick ? ' onclick="event.preventDefault(); location.href=\'/unrelated-policy\'"' : ""}>${options.policyLinkText ?? "Privacy Policy"}</a>${footerConfig}</footer></body></html>`
        : '<!doctype html><html><body><h1>Access denied</h1><footer><a href="security-privacy/">Privacy Policy</a></footer></body></html>');
      return;
    }
    if (pathname === "/never-loading-policy-resource" && options.stallPolicyLoad) return;
    if (pathname === "/canonical/security-privacy/" && options.hubWaitForPolicy) {
      policyRequestedBeforeHubClosed = pendingHubResponses.size > 0 && !hubClosedBeforePolicy;
      for (const hub of pendingHubResponses) { hub.writeHead(404, { "content-type": "text/html" }); hub.end("Not found"); }
    }
    if (["/canonical/security-privacy/", "/unrelated-policy"].includes(pathname) && !options.policyFails) {
      if (pathname === "/canonical/security-privacy/" && options.directPolicyBlocked && !/Mozilla/.test(request.headers["user-agent"] ?? "")) {
        response.writeHead(403, { "content-type": "text/html" }); response.end("Access denied"); return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      const escaped = (options.policyText ?? redirectedPolicyText).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      response.end(`<!doctype html><html lang="en"><title>${options.policyTitle ?? "Privacy Policy"}</title><body><main><h1>${options.policyTitle ?? "Privacy Policy"}</h1><p>${escaped}</p></main>${options.stallPolicyLoad ? '<img src="/never-loading-policy-resource" alt="">' : ""}</body></html>`);
      return;
    }
    response.writeHead(404, { "content-type": "text/html" });
    response.end("<!doctype html><html><body><h1>Not found</h1></body></html>");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("Fixture server unavailable");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { baseUrl, targetUrl: `${baseUrl}/alias`, hubRequest,
    get hubPending() { return pendingHubResponses.size > 0; },
    get policyRequestedBeforeHubClosed() { return policyRequestedBeforeHubClosed; },
    policyUrl: `${baseUrl}/canonical/security-privacy/`, requests,
    async close() { server.close(); server.closeAllConnections(); await once(server, "close"); } };
}
