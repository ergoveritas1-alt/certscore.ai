import type { ConnectionOptions } from "bullmq";

import { getWorkerEnv } from "../env";

let redisConnection: ConnectionOptions | null = null;

export function createRedisConnection(redisUrl: string): ConnectionOptions {
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

export function getSharedRedisConnection() {
  if (redisConnection) {
    return redisConnection;
  }

  const env = getWorkerEnv();
  const redisUrl = env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured.");
  }

  redisConnection = createRedisConnection(redisUrl);
  return redisConnection;
}
