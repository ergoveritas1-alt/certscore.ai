import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { buildDatabaseOperationError, describeDatabaseError } from "./describe-database-error";

afterEach(() => {
  delete process.env.DATABASE_URL;
});

test("describes missing database DNS records with an env-focused message", () => {
  process.env.DATABASE_URL = "postgres://user:pass@db.example.internal:5432/app";

  const message = describeDatabaseError({
    message:
      "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND db.example.internal (ENOTFOUND)",
    name: "TypeError"
  });

  assert.equal(
    message,
    "Database host could not be resolved (db.example.internal:5432). Check DATABASE_URL and confirm the Postgres host is reachable from this machine."
  );
});

test("wraps operation labels around normalized database errors", () => {
  process.env.DATABASE_URL = "postgres://user:pass@db.example.internal:5432/app";

  const error = buildDatabaseOperationError("Failed to create preview domain", {
    details: "connect ECONNREFUSED 127.0.0.1:5432",
    message: "connection refused"
  });

  assert.equal(
    error.message,
    "Failed to create preview domain: Database refused the connection (db.example.internal:5432). Ensure the configured Postgres instance is running and reachable."
  );
});
