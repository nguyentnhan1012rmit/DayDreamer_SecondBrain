CREATE INDEX IF NOT EXISTS "indexing_outbox_status_processed_at_idx"
  ON "indexing_outbox" ("status", "processed_at");

CREATE INDEX IF NOT EXISTS "search_history_expires_at_idx"
  ON "search_history" ("expires_at");
