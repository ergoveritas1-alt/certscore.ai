import type { TrustArcRejectReceipt } from "./trustarc-reject-receipt.js";
import { createHash } from "node:crypto";
import type { CDPSession } from "playwright";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_READS = 4;
const vendorOrigin = "https://consent.trustarc.com";
const routes = new Map([
  ["https://www.delonghi.com/en-us", "delonghi.com"],
  ["https://www.mobvista.com/en", "jz9tfc"],
  ["https://trustarc.com/", "trustarc.com"],
]);
const entryHosts = new Set(["delonghi.com", "www.delonghi.com", "mobvista.com", "www.mobvista.com", "truste.com", "www.truste.com", "trustarc.com", "www.trustarc.com"]);

function resourcePath(raw: string, tenant: string): string | undefined {
  const url = new URL(raw);
  if (url.origin !== vendorOrigin || url.username || url.password || url.hash) return;
  const path = url.pathname;
  if (path === `/cm/${tenant}/bannerconfig` ||
      (tenant === "jz9tfc" && path === "/v2/notice/jz9tfc") ||
      (path === "/v2/consentcategories/getnonemptyindexes" && url.searchParams.getAll("cmId").length === 1 &&
        url.searchParams.get("cmId") === tenant) ||
      (/^\/asset\/notice\.js\/v\/[a-f0-9]{7,40}$/.test(path) && !url.search) ||
      (path === "/notice" && url.searchParams.getAll("domain").length === 1 && url.searchParams.get("domain") === tenant)) return path;
}

type Asset = {
  path: string;
  urlSha256: string;
  status: "pending" | "retained" | "body_unavailable" | "body_limit";
  observedAtEpochMs: number;
  body?: { sha256: string; bytes: number; base64: string };
};

export type TrustArcResponseCapture = {
  contractVersion: "trustarc_response_capture.v1";
  scanId: string;
  documentUrl: string;
  observedUntilEpochMs: number;
  assets: Asset[];
  rejectReceipt?: Pick<TrustArcRejectReceipt, "dispatchAtEpochMs" | "readAtEpochMs" | "writes"> & {
    actionTargetSha256: string;
    stateSha256: string;
  };
};

/** Copy only responses already delivered to a reviewed main document. The CDP
 * cache and decoded byte counter bound body access. Nothing awaits a body read
 * at a navigation, confirmation, or observation boundary. */
export function installTrustArcSourceCapture(session: CDPSession, input: {
  requestedUrl: string; scanId: string; signal?: AbortSignal; resultDeadlineAtMs?: number;
}) {
  const requested = new URL(input.requestedUrl);
  if (requested.protocol !== "https:" || !entryHosts.has(requested.hostname)) return;

  let document: { frameId: string; loaderId: string; url: string; tenant: string } | undefined;
  let frozen = false;
  let attempts = 0;
  const assets: Asset[] = [];
  const requests = new Map<string, string>();
  const pending = new Map<string, { asset: Asset; decodedBytes: number }>();
  const active = () => !frozen && !input.signal?.aborted && Date.now() < (input.resultDeadlineAtMs ?? Infinity);
  const commit = ({ frame }: { frame: { id: string; parentId?: string; loaderId: string; url: string } }) => {
    if (frame.parentId || !active()) return;
    const tenant = routes.get(frame.url);
    document = tenant ? { frameId: frame.id, loaderId: frame.loaderId, url: frame.url, tenant } : undefined;
    requests.clear();
    pending.clear();
    assets.length = 0;
  };
  // Same-document route changes also invalidate the original exact-route binding.
  const withinDocument = ({ frameId, url }: { frameId: string; url: string }) => {
    if (document?.frameId === frameId && document.url !== url) {
      document = undefined;
      requests.clear();
      pending.clear();
      assets.length = 0;
    }
  };
  const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
  const request = (event: {
    requestId: string; frameId?: string; loaderId: string; redirectResponse?: unknown;
    request: { url: string; method: string };
  }) => {
    if (event.redirectResponse) { requests.delete(event.requestId); return; }
    if (!active() || !document || event.frameId !== document.frameId || event.loaderId !== document.loaderId ||
        event.request.method !== "GET" || requests.size >= MAX_READS * 2 || attempts >= MAX_READS) return;
    try {
      if (resourcePath(event.request.url, document.tenant)) requests.set(event.requestId, event.request.url);
    } catch { /* Unparseable URL supplies no provenance. */ }
  };
  const response = (event: {
    requestId: string; frameId?: string; loaderId: string; type: string;
    response: { url: string; status: number; mimeType: string; fromServiceWorker?: boolean };
  }) => {
    const requestUrl = requests.get(event.requestId);
    requests.delete(event.requestId);
    if (!active() || !document || event.frameId !== document.frameId || event.loaderId !== document.loaderId ||
        requestUrl !== event.response.url || attempts >= MAX_READS || event.response.status !== 200 || event.response.fromServiceWorker) return;
    try {
      const path = resourcePath(event.response.url, document.tenant);
      if (!path) return;
      const config = path.endsWith("/bannerconfig") || path.endsWith("/getnonemptyindexes");
      const mime = event.response.mimeType.split(";", 1)[0]?.trim() ?? "";
      const scriptMime = /^(application|text)\/(x-)?(javascript|ecmascript)$/i.test(mime);
      if (config ? !["Fetch", "XHR"].includes(event.type) || !(scriptMime || /^(application\/json|text\/plain)$/i.test(mime))
        : event.type !== "Script" || !scriptMime) return;
      const asset: Asset = { path, urlSha256: sha256(event.response.url), status: "pending", observedAtEpochMs: Date.now() };
      attempts++;
      assets.push(asset);
      pending.set(event.requestId, { asset, decodedBytes: 0 });
    } catch { /* Unparseable URL supplies no provenance. */ }
  };
  const data = ({ requestId, dataLength }: { requestId: string; dataLength: number }) => {
    const row = pending.get(requestId);
    if (!row || !active()) return;
    row.decodedBytes += dataLength;
    if (!Number.isSafeInteger(row.decodedBytes) || row.decodedBytes > MAX_BODY_BYTES) {
      row.asset.status = "body_limit";
      pending.delete(requestId);
    }
  };
  const completed = ({ requestId }: { requestId: string }) => {
    const row = pending.get(requestId);
    if (!row || !active()) return;
    pending.delete(requestId);
    const { asset, decodedBytes } = row;
    const source = document;
    if (decodedBytes <= 0) { asset.status = "body_unavailable"; return; }
    void session.send("Network.getResponseBody", { requestId }).then(result => {
      if (!active() || document !== source) return;
      const { body, base64Encoded } = result as { body: string; base64Encoded: boolean };
      if (typeof body !== "string" || body.length > Math.ceil(MAX_BODY_BYTES / 3) * 4) {
        asset.status = "body_limit";
        return;
      }
      const bytes = Buffer.from(body, base64Encoded ? "base64" : "utf8");
      if (bytes.length > MAX_BODY_BYTES) { asset.status = "body_limit"; return; }
      if (bytes.length !== decodedBytes) { asset.status = "body_unavailable"; return; }
      asset.body = { bytes: bytes.length, sha256: sha256(bytes), base64: bytes.toString("base64") };
      asset.status = "retained";
    }).catch(() => {
      if (active() && document === source) asset.status = "body_unavailable";
    });
  };
  const failed = ({ requestId }: { requestId: string }) => {
    const row = pending.get(requestId);
    if (row) row.asset.status = "body_unavailable";
    pending.delete(requestId);
    requests.delete(requestId);
  };
  session.on("Page.frameNavigated", commit);
  session.on("Page.navigatedWithinDocument", withinDocument);
  session.on("Network.requestWillBeSent", request);
  session.on("Network.responseReceived", response);
  session.on("Network.dataReceived", data);
  session.on("Network.loadingFinished", completed);
  session.on("Network.loadingFailed", failed);
  void session.send("Page.enable").catch(() => undefined);
  void session.send("Network.enable", { maxTotalBufferSize: MAX_BODY_BYTES * MAX_READS, maxResourceBufferSize: MAX_BODY_BYTES }).catch(() => undefined);
  return {
    finish(): TrustArcResponseCapture | undefined {
      if (frozen) return;
      frozen = true;
      session.off("Page.frameNavigated", commit);
      session.off("Page.navigatedWithinDocument", withinDocument);
      session.off("Network.requestWillBeSent", request);
      session.off("Network.responseReceived", response);
      session.off("Network.dataReceived", data);
      session.off("Network.loadingFinished", completed);
      session.off("Network.loadingFailed", failed);
      requests.clear();
      pending.clear();
      if (!document || input.signal?.aborted || !assets.length) return;
      return {
        contractVersion: "trustarc_response_capture.v1", scanId: input.scanId, documentUrl: document.url,
        observedUntilEpochMs: Date.now(), assets: assets.map(asset => ({
          ...asset, status: asset.status === "pending" ? "body_unavailable" : asset.status,
        })),
      };
    },
  };
}
