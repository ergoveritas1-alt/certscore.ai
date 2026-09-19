import { confirmMarketplaceTopic, processMarketplaceEvent } from "../../../../../server/marketplace/aws";
import { requireMarketplaceEnabled } from "../../../../../server/marketplace/config";
import { admitMarketplaceRequest, boundedText } from "../../../../../server/marketplace/http";
import { verifyMarketplaceSns } from "../../../../../server/marketplace/sns";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!admitMarketplaceRequest("events", 120)) return new Response(null, { status: 429 });
  try {
    const config = requireMarketplaceEnabled();
    const message = await verifyMarketplaceSns(JSON.parse(await boundedText(request, 96_000)), config.CERTSCORE_MARKETPLACE_EVENTS_TOPIC_ARN!);
    if (message.Type === "SubscriptionConfirmation") {
      if (!message.Token) return new Response(null, { status: 400 });
      await confirmMarketplaceTopic(message.Token);
    } else {
      await processMarketplaceEvent(JSON.parse(message.Message));
    }
    return new Response(null, { status: 204 });
  } catch {
    console.warn(JSON.stringify({ event: "marketplace_light.event_failed" }));
    // Retry delivery on transient AWS/DB failures; never acknowledge unprocessed changes.
    return new Response(null, { status: 503 });
  }
}
