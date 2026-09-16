import { generateAiText } from "./ai-text.ts";
import {
  formatSummaryDateTime,
  formatSummaryPeriodRange,
  getSummaryPeriod,
  type SummaryPeriod,
  type SummaryPeriodType,
} from "./summary-period.ts";
import { getTuturuuuSummaryModel } from "./tuturuuu-models.ts";

export type SummaryEngineRecord = {
  id: string;
  summary_type: string;
  content: string;
  period_start: Date;
  period_end: Date;
  created_at: Date;
  updated_at: Date;
  source_version: bigint;
  dirty: boolean;
};

export type SummaryActivity = {
  diaries: Array<{ entry_date: Date; raw_text: string }>;
  events: Array<{
    start_time: Date;
    end_time: Date;
    title: string;
    description?: string | null;
  }>;
  attachments: Array<{
    occurred_at: Date;
    extracted_text: string;
    file_type: string;
    source_title?: string | null;
  }>;
  gmail: Array<{
    received_at: Date;
    sender: string;
    subject: string;
    body: string;
  }>;
  drive: Array<{
    occurred_at: Date;
    name: string;
    extracted_text: string;
  }>;
  contacts: Array<{
    occurred_at: Date;
    display_name: string;
    email_addresses: string[];
    organizations: string[];
  }>;
};

export interface SummaryEngineStore {
  findExisting(input: {
    userId: string;
    type: SummaryPeriodType;
    period: SummaryPeriod;
  }): Promise<SummaryEngineRecord | null>;
  findLowerSummaries(input: {
    userId: string;
    type: SummaryPeriodType;
    period: SummaryPeriod;
  }): Promise<SummaryEngineRecord[]>;
  findActivity(input: {
    userId: string;
    period: SummaryPeriod;
    limit: number;
    coveredRanges: Array<{ start: Date; end: Date }>;
  }): Promise<SummaryActivity>;
  getSourceVersion(userId: string): Promise<bigint>;
  save(input: {
    userId: string;
    type: SummaryPeriodType;
    period: SummaryPeriod;
    content: string;
    sourceVersion: bigint;
  }): Promise<SummaryEngineRecord>;
  ensureIndexed(record: SummaryEngineRecord, userId: string): Promise<void>;
}

export type SummaryEngineResult = {
  status: "generated" | "existing" | "empty" | "locked" | "stale";
  period: SummaryPeriod;
  summary?: SummaryEngineRecord;
};

export class SummaryGenerationEngine {
  private readonly store: SummaryEngineStore;
  private readonly options: {
    generateText?: (prompt: string) => Promise<string>;
    withLock?: <T>(
      key: string,
      callback: () => Promise<T>,
    ) => Promise<{ acquired: boolean; value?: T }>;
    contextItemLimit?: number;
    contextMaxChars?: number;
    timeZone?: string;
  };

  constructor(
    store: SummaryEngineStore,
    options: {
      generateText?: (prompt: string) => Promise<string>;
      withLock?: <T>(
        key: string,
        callback: () => Promise<T>,
      ) => Promise<{ acquired: boolean; value?: T }>;
      contextItemLimit?: number;
      contextMaxChars?: number;
      timeZone?: string;
    } = {},
  ) {
    this.store = store;
    this.options = options;
  }

  async generate(input: {
    userId: string;
    type: SummaryPeriodType;
    anchorDate?: Date;
    force?: boolean;
  }): Promise<SummaryEngineResult> {
    const anchorDate = input.anchorDate ?? new Date();
    if (!Number.isFinite(anchorDate.getTime())) {
      throw new Error("Invalid summary date.");
    }
    const period = getSummaryPeriod(
      input.type,
      anchorDate,
      this.options.timeZone,
    );
    const run = () => this.generateUnlocked(input, period);
    if (!this.options.withLock) return run();

    const lock = await this.options.withLock(
      `summary:${input.userId}:${input.type}:${period.localStart}`,
      run,
    );
    return lock.acquired
      ? (lock.value as SummaryEngineResult)
      : { status: "locked", period };
  }

  private async generateUnlocked(
    input: {
      userId: string;
      type: SummaryPeriodType;
      force?: boolean;
    },
    period: SummaryPeriod,
  ): Promise<SummaryEngineResult> {
    const existing = await this.store.findExisting({
      userId: input.userId,
      type: input.type,
      period,
    });
    if (existing && !existing.dirty && !input.force) {
      await this.store.ensureIndexed(existing, input.userId);
      return { status: "existing", period, summary: existing };
    }

    const sourceVersion = await this.store.getSourceVersion(input.userId);
    const context = await this.buildContext(input.userId, input.type, period);
    if (!context) return { status: "empty", period };

    const prompt = buildSummaryPrompt(input.type, period, context);
    const content = sanitizeSummaryContent(
      await (this.options.generateText ?? defaultGenerateText)(prompt),
    );
    if (!content) throw new Error("AI returned an empty summary.");

    const summary = await this.store.save({
      userId: input.userId,
      type: input.type,
      period,
      content,
      sourceVersion,
    });
    return {
      status: summary.dirty ? "stale" : "generated",
      period,
      summary,
    };
  }

  private async buildContext(
    userId: string,
    type: SummaryPeriodType,
    period: SummaryPeriod,
  ) {
    let lowerSummaries: SummaryEngineRecord[] = [];
    for (const lowerType of lowerSummaryTypes(type)) {
      const summaries = await this.store.findLowerSummaries({
        userId,
        type: lowerType,
        period,
      });
      lowerSummaries = summaries.filter((summary) => !summary.dirty);
      if (lowerSummaries.length) {
        break;
      }
    }

    const activity = await this.store.findActivity({
      userId,
      period,
      limit: clamp(this.options.contextItemLimit ?? 80, 10, 200),
      coveredRanges: lowerSummaries.map((summary) => ({
        start: summary.period_start,
        end: summary.period_end,
      })),
    });
    const sections: string[] = [];
    if (lowerSummaries.length) {
      sections.push(
        formatSummaryList(
          `${capitalize(lowerSummaries[0]!.summary_type)} summaries`,
          lowerSummaries,
          period.timeZone,
        ),
      );
    }
    if (activity.diaries.length) {
      sections.push(
        [
          "Diary entries:",
          ...activity.diaries.map(
            (entry) =>
              `- ${formatSummaryDateTime(entry.entry_date, period.timeZone)}: ${entry.raw_text}`,
          ),
        ].join("\n"),
      );
    }
    if (activity.events.length) {
      sections.push(
        [
          "Calendar events:",
          ...activity.events.map(
            (event) =>
              `- ${formatSummaryDateTime(event.start_time, period.timeZone)}-${formatSummaryDateTime(event.end_time, period.timeZone)}: ${event.title}${event.description ? ` - ${event.description}` : ""}`,
          ),
        ].join("\n"),
      );
    }
    if (activity.attachments.length) {
      sections.push(
        [
          "Attachment contents:",
          ...activity.attachments.map(
            (attachment) =>
              `- ${formatSummaryDateTime(attachment.occurred_at, period.timeZone)}${attachment.source_title ? ` (${attachment.source_title})` : ""} [${attachment.file_type}]: ${attachment.extracted_text}`,
          ),
        ].join("\n"),
      );
    }
    if (activity.gmail.length) {
      sections.push(
        [
          "Gmail messages:",
          ...activity.gmail.map(
            (message) =>
              `- ${formatSummaryDateTime(message.received_at, period.timeZone)} from ${message.sender}, subject "${message.subject}": ${message.body}`,
          ),
        ].join("\n"),
      );
    }
    if (activity.drive.length) {
      sections.push(
        [
          "Google Drive documents:",
          ...activity.drive.map(
            (file) =>
              `- ${formatSummaryDateTime(file.occurred_at, period.timeZone)} (${file.name}): ${file.extracted_text}`,
          ),
        ].join("\n"),
      );
    }
    if (activity.contacts.length) {
      sections.push(
        [
          "Updated contacts:",
          ...activity.contacts.map((contact) => {
            const details = [
              contact.email_addresses.join(", "),
              contact.organizations.join(", "),
            ].filter(Boolean);
            return `- ${formatSummaryDateTime(contact.occurred_at, period.timeZone)}: ${contact.display_name}${details.length ? ` (${details.join("; ")})` : ""}`;
          }),
        ].join("\n"),
      );
    }
    if (!sections.length) return null;
    return truncateSections(
      sections,
      this.options.contextMaxChars ?? 24_000,
    );
  }
}

async function defaultGenerateText(prompt: string) {
  return generateAiText({ model: getTuturuuuSummaryModel(), prompt });
}

export function sanitizeSummaryContent(content: string) {
  return content
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function buildSummaryPrompt(
  type: SummaryPeriodType,
  period: SummaryPeriod,
  context: string,
) {
  const instructions: Record<SummaryPeriodType, string> = {
    daily:
      "Create a concise daily log. Capture concrete events, accomplishments, mood if evident, and notable follow-ups.",
    weekly:
      "Create a weekly review. Identify key events, progress, recurring themes, blockers, and 2-3 practical next steps.",
    monthly:
      "Create a monthly retrospective. Highlight major accomplishments, patterns, challenges, changes in habits/mood, and next-month suggestions.",
    yearly:
      "Create a yearly retrospective. Summarize major themes, milestones, recurring patterns, growth areas, and thoughtful recommendations for next year.",
  };
  return `
You are the reflection engine for a personal Second Brain diary.

Summary type: ${type}
Period: ${formatSummaryPeriodRange(period)}

Task:
${instructions[type]}

Rules:
- Use only the supplied context.
- Do not invent people, events, dates, emotions, or outcomes.
- Prefer specific details over generic encouragement.
- If evidence is thin, say so briefly.
- Respond in clear English with short plain-text sections.
- Do not use Markdown emphasis. Never wrap headings, labels, or phrases in **.

Context:
${context}
`.trim();
}

function lowerSummaryTypes(type: SummaryPeriodType): SummaryPeriodType[] {
  if (type === "weekly") return ["daily"];
  if (type === "monthly") return ["weekly", "daily"];
  if (type === "yearly") return ["monthly", "weekly"];
  return [];
}

function formatSummaryList(
  label: string,
  summaries: SummaryEngineRecord[],
  timeZone: string,
) {
  return [
    `${label}:`,
    ...summaries.map(
      (summary) =>
        `- ${formatSummaryDateTime(summary.period_start, timeZone)} to ${formatSummaryDateTime(summary.period_end, timeZone)}: ${summary.content}`,
    ),
  ].join("\n");
}

function truncateContext(context: string, maxChars: number) {
  if (
    !Number.isFinite(maxChars) ||
    maxChars <= 0 ||
    context.length <= maxChars
  ) {
    return context;
  }
  return `${context.slice(0, maxChars)}\n\n[Context truncated to keep the summary request within budget.]`;
}

function truncateSections(sections: string[], maxChars: number) {
  const context = sections.join("\n\n");
  if (!Number.isFinite(maxChars) || maxChars <= 0 || context.length <= maxChars) {
    return context;
  }

  const separatorChars = Math.max(0, sections.length - 1) * 2;
  const available = Math.max(1, maxChars - separatorChars);
  const budget = Math.max(1, Math.floor(available / sections.length));
  return sections
    .map((section) => truncateContext(section, budget))
    .join("\n\n");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.floor(value), min), max);
}
