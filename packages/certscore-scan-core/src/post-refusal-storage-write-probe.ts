import type { Page } from "playwright";
import { CMP_PASSIVE_EVENT_INIT_SCRIPT } from "./cmp-passive-diagnostics.js";
import { TRUSTARC_REQUIRED_ONLY_COOKIES, TRUSTARC_UNDERSCORE_RECEIPT_ROUTES } from "./trustarc-reject-receipt.js";

export async function installPostRefusalStorageWriteProbe(page: Page): Promise<void> {
  await page.addInitScript({ content: `(() => {
    const records = [];
    const priority = ${JSON.stringify(TRUSTARC_UNDERSCORE_RECEIPT_ROUTES)}.includes(location.href) && window === window.top
      ? new Map() : null;
    const trustArcKeys = ${JSON.stringify(Object.keys(TRUSTARC_REQUIRED_ONLY_COOKIES))};
    const read = () => (priority
      ? [...records.slice(-(96 - priority.size)), ...priority.values()]
        .sort((left, right) => left.sequence - right.sequence)
      : records.slice(-96)).map(record => ({ ...record }));
    const hookInstalledAtMs = performance.timeOrigin + performance.now();
    let nextSequence = 0;
    let installedCookieSetter;
    let installedStorageSetter;
    const retain = (record) => {
      const entry = { ...record, sequence: ++nextSequence };
      if (priority && record.storageType === "cookie" && trustArcKeys.includes(record.name))
        priority.set(record.name, entry);
      else records.push(entry);
      const ordinaryLimit = 192 - (priority?.size || 0);
      if (records.length > ordinaryLimit) records.splice(0, records.length - ordinaryLimit);
    };
    Object.defineProperty(window, "__certscoreReadPostRefusalWrites", {
      configurable: false,
      enumerable: false,
      value: Object.assign(read, { coverage: () => ({
        observedLifetimeCount: nextSequence, ringEvictedCount: nextSequence - records.length - (priority?.size || 0),
        readbackOmittedCount: Math.max(0, records.length + (priority?.size || 0) - 96),
        storageHookHealthy: Storage.prototype.setItem === installedStorageSetter,
        cookieHookHealthy: !!installedCookieSetter && Object.getOwnPropertyDescriptor(Document.prototype, "cookie")?.set === installedCookieSetter,
        documentUrl: location.href, documentTimeOriginMs: performance.timeOrigin, hookInstalledAtMs,
      }) }),
      writable: false,
    });
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = installedStorageSetter = function(key, value) {
      let storageType = "local_storage";
      try { storageType = this === window.sessionStorage ? "session_storage" : "local_storage"; } catch (_) {}
      const result = originalSetItem.call(this, key, value);
      retain({ storageType, name: String(key).slice(0, 180), value: String(value).length <= 2048 ? String(value) : undefined, observedAtEpochMs: performance.timeOrigin + performance.now() });
      return result;
    };
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    if (cookieDescriptor && cookieDescriptor.get && cookieDescriptor.set && cookieDescriptor.configurable) {
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        enumerable: cookieDescriptor.enumerable,
        get: cookieDescriptor.get,
        set: installedCookieSetter = function(value) {
          const name = String(value).split("=", 1)[0].trim().slice(0, 180);
          const result = cookieDescriptor.set.call(this, value);
          const cookieValue = String(value).slice(String(value).indexOf("=") + 1).split(";", 1)[0];
          const attributes = String(value).split(";").slice(1).map((attribute) => attribute.trim());
          const maxAge = attributes.find((attribute) => attribute.toLowerCase().startsWith("max-age="))?.slice(8);
          const expires = attributes.find((attribute) => attribute.toLowerCase().startsWith("expires="))?.slice(8);
          const deletion = maxAge !== undefined ? Number(maxAge) <= 0 : expires !== undefined && Date.parse(expires) <= Date.now();
          retain({ storageType: "cookie", name, deletion, value: cookieValue.length <= 2048 ? cookieValue : undefined,
            cookieAssignment: String(value).length <= 4096 ? String(value) : undefined,
            documentUrl: location.href.length <= 2048 ? location.href : undefined,
            observedAtEpochMs: performance.timeOrigin + performance.now() });
          return result;
        },
      });
    }
  })();` + CMP_PASSIVE_EVENT_INIT_SCRIPT });
}
