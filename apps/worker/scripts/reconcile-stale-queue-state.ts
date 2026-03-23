import { reconcileStaleQueueState } from "../src/reconcile-queue-state";

async function main() {
  const result = await reconcileStaleQueueState();
  console.info("[queue-reconcile] complete", result);
}

main().catch((error) => {
  console.error("[queue-reconcile] failed", error);
  process.exit(1);
});
