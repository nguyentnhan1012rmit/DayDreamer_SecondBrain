export type IndexingSource =
  | "diary"
  | "attachment"
  | "calendar"
  | "contact"
  | "drive"
  | "gmail"
  | "summary";

export type IndexingJob = {
  id: string;
  user_id: string;
  job_type: string;
  source_type: string;
  source_id: string;
  status: string;
  retry_count: number;
  max_retries: number;
  error: string | null;
  payload: Record<string, unknown> | null;
  generation: number;
  run_after: Date;
  locked_at: Date | null;
  locked_by: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SourceProcessorContext = {
  assertLeaseCurrent(db?: any): Promise<void>;
};

export type SourceProcessor = (
  job: IndexingJob,
  context: SourceProcessorContext,
) => Promise<void>;

export function normalizeSourceType(sourceType: string): string {
  const normalized = sourceType.trim().toLowerCase();
  const aliases: Record<string, IndexingSource> = {
    diary_entry: "diary",
    diaryentry: "diary",
    journal: "diary",
    file: "attachment",
    upload: "attachment",
    calendar_event: "calendar",
    calendarevent: "calendar",
    google_calendar: "calendar",
    google_contact: "contact",
    google_contacts: "contact",
    contacts: "contact",
    people: "contact",
    google_drive: "drive",
    drive_file: "drive",
    google_drive_file: "drive",
    google_mail: "gmail",
    google_gmail: "gmail",
    gmail_message: "gmail",
    email: "gmail",
    generated_summary: "summary",
  };
  return aliases[normalized] ?? normalized;
}
