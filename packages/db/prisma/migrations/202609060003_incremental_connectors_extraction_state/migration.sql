ALTER TABLE "calendar_events"
  ADD COLUMN "content_hash" TEXT;

ALTER TABLE "gmail_messages"
  ADD COLUMN "history_id" TEXT,
  ADD COLUMN "content_hash" TEXT;

ALTER TABLE "google_drive_files"
  ADD COLUMN "content_hash" TEXT,
  ADD COLUMN "extraction_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "extraction_completeness" DOUBLE PRECISION,
  ADD COLUMN "extraction_error" TEXT,
  ADD COLUMN "extraction_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "extraction_updated_at" TIMESTAMP(3);

ALTER TABLE "attachments"
  ADD COLUMN "content_hash" TEXT,
  ADD COLUMN "extraction_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "extraction_completeness" DOUBLE PRECISION,
  ADD COLUMN "extraction_error" TEXT,
  ADD COLUMN "extraction_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "extraction_updated_at" TIMESTAMP(3);

UPDATE "attachments"
SET
  "extraction_status" = CASE
    WHEN "extracted_text" IS NULL OR btrim("extracted_text") = '' THEN 'pending'
    WHEN "extracted_text" ILIKE '%Full text extraction was unavailable%' THEN 'failed'
    ELSE 'complete'
  END,
  "extraction_completeness" = CASE
    WHEN "extracted_text" IS NULL OR btrim("extracted_text") = '' THEN NULL
    WHEN "extracted_text" ILIKE '%Full text extraction was unavailable%' THEN 0
    ELSE 1
  END;

UPDATE "google_drive_files"
SET
  "extraction_status" = CASE
    WHEN "extracted_text" IS NULL OR btrim("extracted_text") = '' THEN 'pending'
    WHEN "extracted_text" ILIKE '%Full text extraction was unavailable%' THEN 'failed'
    ELSE 'complete'
  END,
  "extraction_completeness" = CASE
    WHEN "extracted_text" IS NULL OR btrim("extracted_text") = '' THEN NULL
    WHEN "extracted_text" ILIKE '%Full text extraction was unavailable%' THEN 0
    ELSE 1
  END;

CREATE INDEX "google_drive_files_user_extraction_status_idx"
  ON "google_drive_files"("user_id", "extraction_status");
