import { createPostgrestCompatClient, type PostgrestCompatClient } from "./postgrest-compat";

export function createDatabaseClient(env: NodeJS.ProcessEnv = process.env): PostgrestCompatClient {
  void env;
  return createPostgrestCompatClient();
}
