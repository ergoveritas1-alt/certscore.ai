import assert from "node:assert/strict";
import test from "node:test";
import { enrichNetworkDestination } from "./network-destination";

test("network destination keeps CDP remote IP and CDN-edge label when local GeoLite2 files are unavailable", async () => {
  const destination = await enrichNetworkDestination({
    ip: "142.250.72.2",
    locationLabel: "server location (may be CDN edge)",
    source: "cdp_remote_ip"
  });

  assert.deepEqual(destination, {
    ip: "142.250.72.2",
    locationLabel: "server location (may be CDN edge)",
    source: "cdp_remote_ip"
  });
});

test("network destination omits non-public CDP remote IP evidence", async () => {
  const destination = await enrichNetworkDestination({
    ip: "192.168.10.4",
    locationLabel: "server location (may be CDN edge)",
    source: "cdp_remote_ip"
  });

  assert.equal(destination, undefined);
});
