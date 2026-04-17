import { createPostgrestCompatClient, type PostgrestCompatClient } from "./postgrest-compat";

export function createAdminClient(env: NodeJS.ProcessEnv = process.env): PostgrestCompatClient {
  void env;
  return createPostgrestCompatClient();
}
