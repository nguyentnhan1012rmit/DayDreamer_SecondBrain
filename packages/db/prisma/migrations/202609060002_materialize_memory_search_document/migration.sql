DO $$
BEGIN
  IF to_regclass('public.memory_chunks') IS NULL THEN
    RETURN;
  END IF;

  DROP INDEX IF EXISTS "memory_chunks_text_search_idx";

  ALTER TABLE "memory_chunks"
    ADD COLUMN IF NOT EXISTS "search_document" tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'simple',
        coalesce("text", '') || ' ' || coalesce("evidence", '') || ' ' || coalesce("metadata"::text, '')
      )
    ) STORED;

  CREATE INDEX IF NOT EXISTS "memory_chunks_text_search_idx"
    ON "memory_chunks" USING gin ("search_document");
END $$;
