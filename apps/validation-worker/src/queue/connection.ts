import type { ConnectionOptions } from "bullmq";
import { getConfiguredValidationRedisUrl } from "../env";

let validationRedisConnection: ConnectionOptions | null = null;

function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: username.length > 0 ? username : undefined,
    password: password.length > 0 ? password : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: url.protocol === "rediss:" ? {} : undefined
  };
}

export function getValidationRedisConnection() {
  if (validationRedisConnection) {
    return validationRedisConnection;
  }

  const redisUrl = getConfiguredValidationRedisUrl();

  if (!redisUrl) {
    throw new Error("Validation Redis is not configured.");
  }

  validationRedisConnection = createRedisConnection(redisUrl);
  return validationRedisConnection;
}
