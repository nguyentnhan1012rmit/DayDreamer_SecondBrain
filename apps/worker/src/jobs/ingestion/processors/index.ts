import type { IndexingSource, SourceProcessor } from "../indexing-job";
import { processAttachment } from "./attachment-processor";
import { processCalendar } from "./calendar-processor";
import { processContact } from "./contact-processor";
import { processDiary } from "./diary-processor";
import { processDrive } from "./drive-processor";
import { processGmail } from "./gmail-processor";
import { processSummary } from "./summary-processor";

export const sourceProcessors: Record<IndexingSource, SourceProcessor> = {
  diary: processDiary,
  attachment: processAttachment,
  calendar: processCalendar,
  contact: processContact,
  drive: processDrive,
  gmail: processGmail,
  summary: processSummary,
};
