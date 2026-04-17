import { createPostgrestCompatClient, type PostgrestCompatClient } from "./postgrest-compat";

export type DatabaseClient = PostgrestCompatClient;

export function createDatabaseClient(env: NodeJS.ProcessEnv = process.env): DatabaseClient {
  void env;
  return createPostgrestCompatClient();
}
