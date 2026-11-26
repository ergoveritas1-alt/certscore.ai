import { createHash } from "node:crypto";
import type { Page } from "playwright";
import type { ConsentProofReadGuard } from "./cmp-action-control-proof.js";

// The public Website Builder asset attaches one direct non-passive listener
// per control. Both reviewed handlers call preventDefault before any effect.
const listenerHash = {
  accept: "09dd1d7d93dc830ee3059c4f85e374c9cbe623a7def74f7ec8aab468d7e5cbec",
  reject: "ed4df8cdfe6761f652794d22a8751cb64142c121dc03053249e877d916d3bd0d",
};

export async function verifyStarfieldConsentListener(
  page: Page, selector: string, action: "accept" | "reject", guard: ConsentProofReadGuard,
): Promise<boolean> {
  const target = "https://starfieldtech.com/";
  if (page.url() !== target) return false;
  const opening = page.context().newCDPSession(page);
  let client: Awaited<typeof opening> | undefined;
  try {
    client = await guard.read(() => opening);
    const session = client;
    const {frameTree} = await guard.read(() => session.send("Page.getFrameTree"));
    const {result} = await guard.read(() => session.send("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      objectGroup: "starfield-exact-consent",
    }));
    if (!result.objectId) return false;
    const {listeners} = await guard.read(() => session.send("DOMDebugger.getEventListeners", {
      objectId: result.objectId!, depth: 0, pierce: false,
    }));
    const clicks = listeners.filter(listener => listener.type === "click");
    const listener = clicks[0];
    const source = listener?.originalHandler?.description ?? listener?.handler?.description;
    if (clicks.length !== 1 || listener?.passive || !source || source.length > 240 ||
        createHash("sha256").update(source).digest("hex") !== listenerHash[action]) return false;
    const after = await guard.read(() => session.send("Page.getFrameTree"));
    return page.url() === target && after.frameTree.frame.loaderId === frameTree.frame.loaderId;
  } catch {
    guard.checkpoint();
    return false;
  } finally {
    if (client) void client.detach().catch(() => undefined);
    else void opening.then(session => session.detach()).catch(() => undefined);
  }
}
