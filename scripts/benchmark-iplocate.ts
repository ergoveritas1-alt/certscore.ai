/** Offline synthetic benchmark. Uses installed databases; makes no network calls. */
import { enrichNetworkDestination } from "../packages/certscore-scan-core/src/network-destination.js";

const destination = (ip: string) => ({ ip, source: "response_server_addr" as const, locationLabel: "server location (may be CDN edge)" as const });
async function main() {
  const memoryBefore = process.memoryUsage().rss;
  const started = performance.now();
  const example = await enrichNetworkDestination(destination("8.8.8.8"));
  const firstLookupMs = performance.now() - started;
  if (example?.enrichment?.country !== "resolved" || example.enrichment.network !== "resolved") {
    throw new Error("Install current IPLocate databases before benchmarking; missing/stale data is not a lookup benchmark.");
  }
  const rssDeltaMiB = (process.memoryUsage().rss - memoryBefore) / 1048576;
  const measure = async (label: string, addresses: string[]) => {
    const times: number[] = [];
    for (const ip of addresses) {
      const start = performance.now();
      await enrichNetworkDestination(destination(ip));
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { label, count: times.length, meanMs: times.reduce((sum, ms) => sum + ms, 0) / times.length, p95Ms: times[Math.floor(times.length * 0.95)] };
  };
  const mixed = Array.from({ length: 10000 }, (_, i) => i % 2
    ? `2606:4700:${i.toString(16)}::1111`
    : `11.${Math.floor(i / 256)}.${i % 256}.1`);
  const measurements = [await measure("Unique synthetic IPs (including database misses)", mixed), await measure("Repeated IP, warm cache", Array.from({ length: 10000 }, () => "8.8.8.8"))];
  console.log(JSON.stringify({ note: "Local lookup benchmark, not an AWS cold-start or full-scan measurement", firstLookupMs, rssDeltaMiB, measurements }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
