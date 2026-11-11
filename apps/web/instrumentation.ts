export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.CERTSCORE_BF26_EMAIL_DELIVERY === "1") {
    const { startCampaignMaintenance } = await import("./server/promotions/maintenance");
    startCampaignMaintenance();
  }
}
