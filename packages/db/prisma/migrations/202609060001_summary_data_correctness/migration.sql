ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "memory_revision" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "summaries"
  ADD COLUMN IF NOT EXISTS "source_version" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dirty" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "indexing_outbox"
  ADD COLUMN IF NOT EXISTS "generation" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "summaries_dirty_period_end_idx"
  ON "summaries"("dirty", "period_end");

CREATE TABLE IF NOT EXISTS "storage_deletion_outbox" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT,
  "bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "max_retries" INTEGER NOT NULL DEFAULT 10,
  "error" TEXT,
  "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storage_deletion_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "storage_deletion_outbox_bucket_path_key"
  ON "storage_deletion_outbox"("bucket", "storage_path");
CREATE INDEX IF NOT EXISTS "storage_deletion_outbox_status_run_after_idx"
  ON "storage_deletion_outbox"("status", "run_after", "created_at");

CREATE OR REPLACE FUNCTION cleanup_deleted_memory_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user_id TEXT;
  affected_from TIMESTAMP(3);
  affected_to TIMESTAMP(3);
  memory_source_type TEXT;
BEGIN
  IF TG_TABLE_NAME = 'diary_entries' THEN
    affected_user_id := OLD.user_id;
    affected_from := OLD.entry_date;
    affected_to := OLD.entry_date;
    memory_source_type := 'diary';
    INSERT INTO storage_deletion_outbox (user_id, bucket, storage_path)
    SELECT OLD.user_id, 'attachments-bucket', storage_path
    FROM attachments WHERE diary_entry_id = OLD.id
    ON CONFLICT (bucket, storage_path) DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, storage_deletion_outbox.user_id),
      status = 'pending', retry_count = 0, error = NULL,
      run_after = now(), processed_at = NULL, updated_at = now();
    DELETE FROM memory_chunks
    WHERE user_id = OLD.user_id AND source_type = 'attachment'
      AND source_id IN (
        SELECT id FROM attachments WHERE diary_entry_id = OLD.id
      );
    DELETE FROM indexing_outbox
    WHERE user_id = OLD.user_id AND source_type = 'attachment'
      AND source_id IN (
        SELECT id FROM attachments WHERE diary_entry_id = OLD.id
      );
  ELSIF TG_TABLE_NAME = 'attachments' THEN
    SELECT user_id, entry_date INTO affected_user_id, affected_from
    FROM diary_entries WHERE id = OLD.diary_entry_id;
    affected_to := affected_from;
    memory_source_type := 'attachment';
    INSERT INTO storage_deletion_outbox (user_id, bucket, storage_path)
    VALUES (affected_user_id, 'attachments-bucket', OLD.storage_path)
    ON CONFLICT (bucket, storage_path) DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, storage_deletion_outbox.user_id),
      status = 'pending', retry_count = 0, error = NULL,
      run_after = now(), processed_at = NULL, updated_at = now();
  ELSIF TG_TABLE_NAME = 'calendar_events' THEN
    affected_user_id := OLD.user_id;
    affected_from := OLD.start_time;
    affected_to := OLD.end_time;
    memory_source_type := 'calendar';
  ELSIF TG_TABLE_NAME = 'gmail_messages' THEN
    affected_user_id := OLD.user_id;
    affected_from := COALESCE(OLD.received_at, OLD.updated_at);
    affected_to := affected_from;
    memory_source_type := 'gmail';
  ELSIF TG_TABLE_NAME = 'google_contacts' THEN
    affected_user_id := OLD.user_id;
    memory_source_type := 'contact';
  ELSIF TG_TABLE_NAME = 'google_drive_files' THEN
    affected_user_id := OLD.user_id;
    affected_from := COALESCE(OLD.modified_time, OLD.updated_at);
    affected_to := affected_from;
    memory_source_type := 'drive';
  ELSIF TG_TABLE_NAME = 'summaries' THEN
    affected_user_id := OLD.user_id;
    memory_source_type := 'summary';
  END IF;

  DELETE FROM memory_chunks
  WHERE user_id = affected_user_id
    AND source_type = memory_source_type
    AND source_id = OLD.id;
  DELETE FROM indexing_outbox
  WHERE user_id = affected_user_id
    AND source_type = memory_source_type
    AND source_id = OLD.id;

  IF memory_source_type = 'summary' THEN
    WITH marked AS (
      UPDATE summaries
      SET dirty = TRUE, updated_at = now()
      WHERE user_id = OLD.user_id
        AND CASE summary_type
              WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2
              WHEN 'monthly' THEN 3 WHEN 'yearly' THEN 4 ELSE 0
            END > CASE OLD.summary_type
                    WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2
                    WHEN 'monthly' THEN 3 WHEN 'yearly' THEN 4 ELSE 0
                  END
        AND period_end >= OLD.period_start
        AND period_start <= OLD.period_end
      RETURNING id
    )
    DELETE FROM memory_chunks
    WHERE user_id = OLD.user_id
      AND source_type = 'summary'
      AND source_id IN (SELECT id FROM marked);
  END IF;

  IF memory_source_type <> 'summary' AND affected_user_id IS NOT NULL THEN
    UPDATE users
    SET memory_revision = memory_revision + 1, updated_at = now()
    WHERE id = affected_user_id;

    WITH marked AS (
      UPDATE summaries
      SET dirty = TRUE, updated_at = now()
      WHERE user_id = affected_user_id
        AND (affected_from IS NULL OR period_end >= affected_from)
        AND (affected_to IS NULL OR period_start <= affected_to)
      RETURNING id
    )
    DELETE FROM memory_chunks
    WHERE user_id = affected_user_id
      AND source_type = 'summary'
      AND source_id IN (SELECT id FROM marked);

    UPDATE search_history
    SET expires_at = now()
    WHERE user_id = affected_user_id AND expires_at > now();
  END IF;
  RETURN OLD;
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'diary_entries', 'attachments', 'calendar_events', 'gmail_messages',
    'google_contacts', 'google_drive_files', 'summaries'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS cleanup_deleted_memory_source_trigger ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER cleanup_deleted_memory_source_trigger BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION cleanup_deleted_memory_source()',
      table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE "storage_deletion_outbox" ENABLE ROW LEVEL SECURITY;

DO $security$
DECLARE
  backend_role TEXT := current_user;
BEGIN
  EXECUTE format(
    'CREATE POLICY backend_full_access ON storage_deletion_outbox FOR ALL TO %I USING (true) WITH CHECK (true)',
    backend_role
  );
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE storage_deletion_outbox FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE storage_deletion_outbox FROM authenticated';
  END IF;
END
$security$;
