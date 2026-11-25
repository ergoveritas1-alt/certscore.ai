import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { CAIA_ACCEPT_CONTROL } from "@certscore/contracts";
import type { ConsentProofReadGuard } from "./cmp-action-control-proof.js";

const confirmSelector = "#cookie_consent_manager_confirm";
const managerSelector = "#cookie_consent_manager";
// Reviewed from the exact homepage source. A changed listener, apply
// implementation, or cookie writer must be reviewed before release.
const reviewedHandlers = [
  "995d15c0d9424e76b4c9a21be729f10286ce626d9f26e62d9906acb7fabea821",
  "e0bab554caff9a7e154d5be5e0f712f2f9c3fe54fcbd4d0de89e2428e61d8339",
  "35326fec9bd3804cea702c0ee0df97c39f3363699a82b3ea3abc7bd81ec6d878",
  "bb19beff3d20ff74164fa1767d5c3afb71269323bbd27238994eda55bde44da6",
];
const functionHash = (source: string) => createHash("sha256").update(source.trim().replace(/\s+/g, " ")).digest("hex");

export async function verifyCaiaAcceptListeners(page: Page, guard: ConsentProofReadGuard): Promise<boolean> {
  const caia = CAIA_ACCEPT_CONTROL;
  if (page.url() !== caia.targetUrl) return false;
  const opening = page.context().newCDPSession(page);
  let client: Awaited<typeof opening> | undefined;
  try {
    client = await guard.read(() => opening);
    const session = client;
    const {frameTree} = await guard.read(() => session.send("Page.getFrameTree"));
    const sources = await guard.read(() => page.evaluate(({managerSelector, confirmSelector, bannerSelector}) => {
      const banner = document.querySelector(bannerSelector);
      const manager = document.querySelector(managerSelector);
      const confirm = manager?.querySelector(confirmSelector);
      const categoryIds = [...(manager?.querySelectorAll<HTMLInputElement>("input[type=checkbox]") ?? [])].map(input => input.value);
      if (!banner || !manager || !confirm || manager.parentElement !== banner.parentElement ||
          getComputedStyle(manager).display !== "none" || categoryIds.join(",") !== "1,2,3,4" ||
          document.querySelectorAll(managerSelector).length !== 1 || document.querySelectorAll(confirmSelector).length !== 1 ||
          confirm.closest("form,a,button,label,[contenteditable]")) return [];
      return ["cm_action", "set_cookie_consent"].map(name => {
        const value = Object.getOwnPropertyDescriptor(window, name)?.value;
        return typeof value === "function" ? Function.prototype.toString.call(value).slice(0, 2_000) : "";
      });
    }, {managerSelector, confirmSelector, bannerSelector: caia.bannerSelector}));
    if (sources.length !== 2 || !sources.every((source, index) => functionHash(source) === reviewedHandlers[index + 2])) return false;
    for (const [index, selector] of [caia.controlSelector, confirmSelector].entries()) {
      const {result} = await guard.read(() => session.send("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(selector)})`, objectGroup: "caia-exact-consent",
      }));
      if (!result.objectId) return false;
      const {listeners} = await guard.read(() => session.send("DOMDebugger.getEventListeners", {
        objectId: result.objectId!, depth: 0, pierce: false,
      }));
      const click = listeners.filter(listener => listener.type === "click");
      const handler = click[0]?.originalHandler?.description ?? click[0]?.handler?.description;
      if (click.length !== 1 || !handler || handler.length > 2_000 || functionHash(handler) !== reviewedHandlers[index]) return false;
    }
    const after = await guard.read(() => session.send("Page.getFrameTree"));
    return page.url() === caia.targetUrl && frameTree.frame.loaderId === after.frameTree.frame.loaderId;
  } catch {
    guard.checkpoint();
    return false;
  } finally {
    if (client) void client.detach().catch(() => undefined);
    else void opening.then(session => session.detach()).catch(() => undefined);
  }
}
