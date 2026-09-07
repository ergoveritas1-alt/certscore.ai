import "server-only";
import type { CrawlPage } from "@website-signal-risk-scanner/shared";
import { countInventoryResourceChildren, crawlOccurrenceGraphIdentity } from "../../lib/scans/inventory-resource-relationships";
import { networkDestinationSchema } from "@certscore/contracts";
import { z } from "zod";
import { loadFullSiteGraphContext } from "./full-site-graph";

// Only verified numeric summaries are cached, never full evidence bundles.
const summaries = new Map<string, { expiresAt: number; result: Promise<Map<string, { count: number; destinations: Array<z.infer<typeof networkDestinationSchema>> }> | undefined> }>();
async function pageCounts(scanId: string, page: CrawlPage, configurationHash: string) {
  const observation = page.observation;
  if (!observation?.runtimeGraph || observation.parentScanId !== scanId || observation.pageJobId !== page.id || observation.configurationHash !== configurationHash) return undefined;
  const key = JSON.stringify([scanId, page.id, observation.attemptId, configurationHash, observation.sourceHash, observation.runtimeGraph.sha256]);
  const cached = summaries.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const result = (async () => {
    try {
      const context = await loadFullSiteGraphContext(scanId, page.id);
      const projection = context?.projection;
      if (projection?.sourceBundle?.sha256 !== observation.sourceHash) return undefined;
      const graph = projection.graphs.find(item => item.scenario === "pre_consent");
      if (!graph || graph.sourceHash !== observation.runtimeGraph!.sha256) return undefined;
      const network = z.object({ networkEvents: z.array(z.object({ eventId: z.string(), networkDestination: networkDestinationSchema.optional() })).max(30000) }).safeParse(context?.evidence);
      const destinations = new Map(network.success ? network.data.networkEvents.map(event => [event.eventId, event.networkDestination]) : []);
      return new Map(observation.occurrences.map(occurrence => {
        const destination = destinations.get(occurrence.id);
        return [occurrence.id, { count: countInventoryResourceChildren(graph, crawlOccurrenceGraphIdentity(occurrence)), destinations: destination ? [destination] : [] }];
      }));
    } catch { return undefined; }
  })();
  summaries.set(key, { expiresAt: Date.now() + 10 * 60_000, result });
  if (summaries.size > 128) summaries.delete(summaries.keys().next().value!);
  return result;
}

/** Bounded reads for the displayed rows; missing evidence stays unknown. */
export async function loadFullSiteRelationshipCounts(scanId: string, pages: CrawlPage[], pageIds: string[], configurationHash: string) {
  const selected = pages.filter(page => pageIds.includes(page.id));
  const counts = new Map<string, Map<string, { count: number; destinations: Array<z.infer<typeof networkDestinationSchema>> }>>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
    while (cursor < selected.length) {
      const page = selected[cursor++]!;
      const result = await pageCounts(scanId, page, configurationHash);
      if (result) counts.set(page.id, result);
    }
  }));
  return counts;
}
