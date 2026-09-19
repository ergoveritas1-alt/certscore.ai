import { createHmac, timingSafeEqual } from "node:crypto";

export function marketplaceKeyProof(secret: string, timestamp: string, token: string) {
  return createHmac("sha256", secret).update(`certscore.marketplace-key-check.v1\n${timestamp}\n${token}`).digest("hex");
}

export function verifyMarketplaceKeyProof(secret: string, timestamp: string, token: string, proof: string, now = Date.now()) {
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 30_000 || !/^[a-f0-9]{64}$/.test(proof)) return false;
  return timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(marketplaceKeyProof(secret, timestamp, token), "hex"));
}
