import { createVerify, X509Certificate } from "node:crypto";
import { z } from "zod";

const envelope = z.object({
  Type: z.enum(["Notification", "SubscriptionConfirmation"]),
  MessageId: z.string().uuid(),
  TopicArn: z.string(),
  Message: z.string().max(64_000),
  Timestamp: z.string().datetime(),
  SignatureVersion: z.enum(["1", "2"]),
  Signature: z.string().max(2048),
  SigningCertURL: z.string().url(),
  Subject: z.string().optional(),
  Token: z.string().max(8192).optional(),
  SubscribeURL: z.string().url().optional(),
});
export type SnsEnvelope = z.infer<typeof envelope>;

export function snsCanonicalMessage(message: SnsEnvelope) {
  const fields: (keyof SnsEnvelope)[] = message.Type === "Notification"
    ? ["Message", "MessageId", ...(message.Subject === undefined ? [] : ["Subject" as const]), "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const;
  return fields.map(field => {
    const value = message[field];
    if (typeof value !== "string") throw new Error("Missing signed SNS field.");
    return `${field}\n${value}\n`;
  }).join("");
}

export function allowedSnsCertificate(url: string) {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.hostname === "sns.us-east-1.amazonaws.com"
    && !parsed.port && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
    && /^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(parsed.pathname);
}

export async function verifyMarketplaceSns(value: unknown, topicArn: string, fetcher: typeof fetch = fetch) {
  const message = envelope.parse(value);
  if (message.TopicArn !== topicArn || !allowedSnsCertificate(message.SigningCertURL)) throw new Error("Untrusted SNS sender.");
  // Permit AWS delivery retries; database event ordering makes replay idempotent.
  if (new Date(message.Timestamp).getTime() > Date.now() + 300_000) throw new Error("Invalid SNS timestamp.");
  const response = await fetcher(message.SigningCertURL, { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("SNS certificate unavailable.");
  const pem = await response.text();
  if (pem.length > 16_384) throw new Error("Invalid SNS certificate.");
  const certificate = new X509Certificate(pem);
  const now = Date.now();
  if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) < now) throw new Error("Expired SNS certificate.");
  const verifier = createVerify(message.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
  verifier.update(snsCanonicalMessage(message));
  if (!verifier.verify(certificate.publicKey, message.Signature, "base64")) throw new Error("Invalid SNS signature.");
  return message;
}
