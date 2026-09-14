import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  generateAiText,
  getSummaryPeriod,
  getTuturuuuAnswerModel,
} from '@second-brain/ai';
import {
  deleteMemoryChunksForSource,
  markMemorySourcesChanged,
  Prisma,
} from '@second-brain/db';
import { isAttachmentExtractionFallback } from '@second-brain/shared';
import { invalidateUserSearchCache } from '../../common/cache/search-answer-cache';
import { PrismaService } from '../../prisma/prisma.service'; // Adjust path based on your setup
import { CreateDiaryDto, DIARY_MOODS } from './dto/create-diary.dto';

type DiaryMood = (typeof DIARY_MOODS)[number];
type DiaryCursor = { createdAt: string; id: string };
type AttachmentJob = {
  source_id: string;
  status: string;
  error: string | null;
  retry_count: number;
  updated_at: Date;
};
type DiaryStatisticsRow = {
  totalEntries: number;
  activeDays: number;
  totalWords: number;
  moodCounts: Partial<Record<DiaryMood, number>> | null;
  topTags: Array<{ tag: string; count: number }> | null;
  days: Array<{ date: string; entryCount: number; wordCount: number }> | null;
  availableYears: number[] | null;
};

const DEFAULT_DIARY_PAGE_SIZE = 25;

@Injectable()
export class DiaryService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateDiaryDto) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const entry = await this.prisma.$transaction(async (tx) => {
      const tags = this.normalizeTags(dto.tags);
      const mood = this.normalizeMood(dto.mood);
      const created = await tx.diaryEntry.create({
        data: {
          raw_text: `${dto.title}\n\n${dto.content}`,
          user_id: user.id,
          status: 'published',
          ...(mood ? { mood } : {}),
          tags,
          ...(dto.entryDate ? { entry_date: new Date(dto.entryDate) } : {}),
        },
      });

      await this.enqueueIndexingJob(tx, {
        userId: user.id,
        sourceType: 'diary',
        sourceId: created.id,
        payload: { sourceTitle: dto.title, mood, tags },
      });
      await markMemorySourcesChanged(tx as any, {
        userId: user.id,
        occurredFrom: created.entry_date,
        occurredTo: created.entry_date,
      });

      return created;
    });

    return {
      ...this.toClientEntry(entry),
      memoryIndexed: false,
      memoryIndexingStatus: 'queued',
      memoryChunkCount: 0,
    };
  }

  async findAll(
    userId: string,
    options: {
      limit?: number;
      cursor?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (!user) return { entries: [], nextCursor: null, hasMore: false };

    const limit = options.limit ?? DEFAULT_DIARY_PAGE_SIZE;
    const cursor = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;
    const cursorDate = cursor ? new Date(cursor.createdAt) : undefined;
    const startDate = this.parseOptionalDate(options.startDate, 'startDate');
    const endDate = this.parseOptionalDate(options.endDate, 'endDate');
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }

    const entries = await this.prisma.diaryEntry.findMany({
      where: {
        user_id: user.id,
        ...(startDate || endDate
          ? {
              entry_date: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {}),
        ...(cursor && cursorDate
          ? {
              OR: [
                { created_at: { lt: cursorDate } },
                { created_at: cursorDate, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        raw_text: true,
        status: true,
        mood: true,
        tags: true,
        entry_date: true,
        created_at: true,
        updated_at: true,
        attachments: {
          select: {
            id: true,
            storage_path: true,
            file_type: true,
            extracted_text: true,
            extraction_status: true,
            extraction_completeness: true,
            extraction_error: true,
            created_at: true,
          },
          orderBy: { created_at: 'asc' },
        },
        calendar_events: {
          select: {
            id: true,
            title: true,
            start_time: true,
            end_time: true,
            html_link: true,
          },
          orderBy: { start_time: 'asc' },
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = entries.length > limit;
    const pageEntries = hasMore ? entries.slice(0, limit) : entries;
    const jobsByAttachmentId = await this.loadAttachmentJobs(
      pageEntries.flatMap((entry) => entry.attachments ?? []),
    );
    const lastEntry = pageEntries.at(-1);

    return {
      entries: pageEntries.map((entry) =>
        this.toClientEntry(entry, jobsByAttachmentId),
      ),
      nextCursor:
        hasMore && lastEntry
          ? this.encodeCursor({
              createdAt: lastEntry.created_at.toISOString(),
              id: lastEntry.id,
            })
          : null,
      hasMore,
    };
  }

  async getStatistics(
    userId: string,
    options: {
      period: 'weekly' | 'yearly';
      anchor?: string;
      timeZone?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });
    const anchor = options.anchor ? new Date(options.anchor) : new Date();
    if (!Number.isFinite(anchor.getTime())) {
      throw new BadRequestException('Invalid statistics anchor date');
    }
    const period = getSummaryPeriod(options.period, anchor, options.timeZone);

    if (!user) {
      return this.emptyStatistics(options.period, period);
    }

    const rows = await this.prisma.$queryRaw<DiaryStatisticsRow[]>(Prisma.sql`
      WITH filtered AS (
        SELECT
          raw_text,
          mood,
          tags,
          to_char(entry_date AT TIME ZONE ${period.timeZone}, 'YYYY-MM-DD') AS local_date,
          CASE
            WHEN btrim(raw_text) = '' THEN 0
            ELSE cardinality(regexp_split_to_array(btrim(raw_text), '[[:space:]]+'))
          END AS word_count
        FROM diary_entries
        WHERE user_id = ${user.id}::text
          AND entry_date >= ${period.start}
          AND entry_date <= ${period.end}
      ),
      day_stats AS (
        SELECT
          local_date,
          COUNT(*)::int AS entry_count,
          COALESCE(SUM(word_count), 0)::int AS word_count
        FROM filtered
        GROUP BY local_date
      ),
      mood_stats AS (
        SELECT mood, COUNT(*)::int AS count
        FROM filtered
        WHERE mood IN ('great', 'good', 'neutral', 'bad')
        GROUP BY mood
      ),
      tag_stats AS (
        SELECT expanded.tag, COUNT(*)::int AS count
        FROM filtered
        CROSS JOIN LATERAL unnest(tags) AS expanded(tag)
        GROUP BY expanded.tag
        ORDER BY count DESC, expanded.tag ASC
        LIMIT 8
      )
      SELECT
        (SELECT COUNT(*)::int FROM filtered) AS "totalEntries",
        (SELECT COUNT(*)::int FROM day_stats) AS "activeDays",
        (SELECT COALESCE(SUM(word_count), 0)::int FROM filtered) AS "totalWords",
        (SELECT COALESCE(jsonb_object_agg(mood, count), '{}'::jsonb) FROM mood_stats) AS "moodCounts",
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('tag', tag, 'count', count) ORDER BY count DESC, tag ASC), '[]'::jsonb) FROM tag_stats) AS "topTags",
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('date', local_date, 'entryCount', entry_count, 'wordCount', word_count) ORDER BY local_date ASC), '[]'::jsonb) FROM day_stats) AS days,
        (
          SELECT COALESCE(jsonb_agg(year ORDER BY year DESC), '[]'::jsonb)
          FROM (
            SELECT DISTINCT EXTRACT(YEAR FROM entry_date AT TIME ZONE ${period.timeZone})::int AS year
            FROM diary_entries
            WHERE user_id = ${user.id}::text
          ) available_years
        ) AS "availableYears"
    `);
    const aggregate = rows[0];
    const moodCounts: Record<DiaryMood, number> = {
      great: 0,
      good: 0,
      neutral: 0,
      bad: 0,
      ...(aggregate?.moodCounts ?? {}),
    };
    const totalEntries = aggregate?.totalEntries ?? 0;
    const activeDays = aggregate?.activeDays ?? 0;
    const totalWords = aggregate?.totalWords ?? 0;

    return {
      period: options.period,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      timeZone: period.timeZone,
      totalEntries,
      activeDays,
      totalWords,
      averageWordsPerActiveDay: Math.round(
        totalWords / Math.max(activeDays, 1),
      ),
      moodCounts,
      topTags: aggregate?.topTags ?? [],
      days: aggregate?.days ?? [],
      availableYears:
        Array.from(
          new Set([
            Number(period.localStart.slice(0, 4)),
            ...(aggregate?.availableYears ?? []),
          ]),
        ).sort((left, right) => right - left),
    };
  }

  async findOne(userId: string, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('Diary entry not found');

    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id, user_id: user.id },
      include: {
        attachments: {
          orderBy: { created_at: 'asc' },
        },
        calendar_events: {
          orderBy: { start_time: 'asc' },
        },
      },
    });
    if (!entry) throw new NotFoundException('Diary entry not found');
    const jobs = await this.loadAttachmentJobs(entry.attachments ?? []);
    return this.toClientEntry(entry, jobs);
  }

  async update(userId: string, id: string, dto: Partial<CreateDiaryDto>) {
    const { user, entry: existingEntry } = await this.findOwnedEntry(
      userId,
      id,
    );
    const existingClientEntry = this.toClientEntry(existingEntry);
    const title = dto.title ?? existingClientEntry.title;
    const content = dto.content ?? existingClientEntry.content;
    const rawText = this.buildRawText(title, content);
    const entryDate = dto.entryDate ? new Date(dto.entryDate) : undefined;
    const mood = this.normalizeMood(dto.mood);
    const tags =
      dto.tags === undefined ? undefined : this.normalizeTags(dto.tags);

    const entry = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.diaryEntry.update({
        where: { id },
        data: {
          raw_text: rawText,
          ...(dto.mood !== undefined ? { mood } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(entryDate ? { entry_date: entryDate } : {}),
        },
      });

      await this.enqueueIndexingJob(tx, {
        userId: user.id,
        sourceType: 'diary',
        sourceId: id,
        payload: {
          sourceTitle: title,
          mood: dto.mood !== undefined ? mood : existingClientEntry.mood,
          tags: tags ?? existingClientEntry.tags,
        },
      });
      await markMemorySourcesChanged(tx as any, {
        userId: user.id,
        occurredFrom:
          existingEntry.entry_date < updated.entry_date
            ? existingEntry.entry_date
            : updated.entry_date,
        occurredTo:
          existingEntry.entry_date > updated.entry_date
            ? existingEntry.entry_date
            : updated.entry_date,
      });

      return updated;
    });

    return {
      ...this.toClientEntry(entry),
      memoryIndexed: false,
      memoryIndexingStatus: 'queued',
      memoryChunkCount: 0,
    };
  }

  async remove(userId: string, id: string) {
    const { user } = await this.findOwnedEntry(userId, id);

    return this.prisma.$transaction(async (tx) => {
      await deleteMemoryChunksForSource(tx, {
        userId: user.id,
        sourceType: 'diary',
        sourceId: id,
      });

      await tx.searchHistory?.updateMany?.({
        where: {
          user_id: user.id,
          expires_at: { gt: new Date() },
        },
        data: { expires_at: new Date() },
      });
      await invalidateUserSearchCache(user.id);

      return tx.diaryEntry.delete({ where: { id } });
    });
  }

  private async findOwnedEntry(userId: string, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('Diary entry not found');

    const entry = await this.prisma.diaryEntry.findFirst({
      where: { id, user_id: user.id },
    });

    if (!entry) throw new NotFoundException('Diary entry not found');

    return { user, entry };
  }

  private async enqueueIndexingJob(
    tx: any,
    input: {
      userId: string;
      sourceType: 'diary';
      sourceId: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const job = await tx.indexingOutbox.upsert({
      where: {
        job_type_source_type_source_id: {
          job_type: 'index_memory',
          source_type: input.sourceType,
          source_id: input.sourceId,
        },
      },
      update: {
        user_id: input.userId,
        status: 'pending',
        retry_count: 0,
        error: null,
        payload: input.payload ?? {},
        generation: { increment: 1 },
        run_after: new Date(),
        locked_at: null,
        locked_by: null,
        processed_at: null,
      },
      create: {
        user_id: input.userId,
        job_type: 'index_memory',
        source_type: input.sourceType,
        source_id: input.sourceId,
        status: 'pending',
        payload: input.payload ?? {},
      },
    });

    await tx.searchHistory?.updateMany?.({
      where: {
        user_id: input.userId,
        expires_at: { gt: new Date() },
      },
      data: { expires_at: new Date() },
    });
    await invalidateUserSearchCache(input.userId);

    return job;
  }

  private buildRawText(title: string, content: string) {
    return `${title.trim()}\n\n${content.trim()}`;
  }

  private parseOptionalDate(value: string | undefined, label: string) {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${label}`);
    }
    return parsed;
  }

  private normalizeMood(value?: string | null): DiaryMood | null {
    if (!value) return null;

    const normalized = value.trim().toLowerCase();
    return DIARY_MOODS.includes(normalized as DiaryMood)
      ? (normalized as DiaryMood)
      : null;
  }

  private normalizeTags(tags?: string[] | null) {
    if (!tags?.length) return [];

    const seen = new Set<string>();
    const normalizedTags: string[] = [];

    for (const tag of tags) {
      const normalized = tag
        .trim()
        .toLowerCase()
        .replace(/^#+/, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');

      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      normalizedTags.push(normalized);

      if (normalizedTags.length >= 12) break;
    }

    return normalizedTags;
  }

  private toClientEntry(
    entry: {
      id: string;
      raw_text: string;
      status: string;
      mood?: string | null;
      tags?: string[] | null;
      created_at: Date;
      updated_at: Date;
      entry_date?: Date | null;
      attachments?: {
        id: string;
        storage_path: string;
        file_type: string;
        extracted_text: string | null;
        extraction_status?: string;
        extraction_completeness?: number | null;
        extraction_error?: string | null;
        created_at: Date;
      }[];
      calendar_events?: {
        id: string;
        title: string;
        start_time: Date;
        end_time: Date;
        html_link?: string | null;
      }[];
    },
    jobsByAttachmentId = new Map<string, AttachmentJob>(),
  ) {
    const trimmedText = entry.raw_text.trim();

    let title = 'Untitled';
    let content = '';

    // First try splitting on double newline (\n\n) as it is the primary format
    const doubleNewLineIndex = trimmedText.indexOf('\n\n');
    if (doubleNewLineIndex !== -1) {
      title = trimmedText.slice(0, doubleNewLineIndex).trim();
      content = trimmedText.slice(doubleNewLineIndex + 2).trim();
    } else {
      // Fallback: try splitting on the first single newline
      const singleNewLineIndex = trimmedText.indexOf('\n');
      if (singleNewLineIndex !== -1) {
        title = trimmedText.slice(0, singleNewLineIndex).trim();
        content = trimmedText.slice(singleNewLineIndex + 1).trim();
      } else {
        // If there are no newlines at all, use the whole text as title (up to a reasonable limit) and empty content
        if (trimmedText.length <= 60) {
          title = trimmedText;
          content = '';
        } else {
          // If the text is long, truncate the title and set the whole text as content
          title = trimmedText.slice(0, 57) + '...';
          content = trimmedText;
        }
      }
    }

    const attachments = this.toClientAttachments(
      entry.attachments ?? [],
      jobsByAttachmentId,
    );

    return {
      id: entry.id,
      title: title || 'Untitled',
      content: content || trimmedText || 'No content',
      attachments,
      calendarEvents: (entry.calendar_events ?? []).map((event) => ({
        id: event.id,
        title: event.title,
        startTime: event.start_time.toISOString(),
        endTime: event.end_time.toISOString(),
        htmlLink: event.html_link ?? null,
      })),
      mood: this.normalizeMood(entry.mood) ?? null,
      tags: entry.tags ?? [],
      status: entry.status,
      entryDate: entry.entry_date?.toISOString(),
      createdAt: entry.created_at.toISOString(),
      updatedAt: entry.updated_at.toISOString(),
    };
  }

  private toClientAttachments(
    attachments: Array<{
      id: string;
      storage_path: string;
      file_type: string;
      extracted_text: string | null;
      extraction_status?: string;
      extraction_completeness?: number | null;
      extraction_error?: string | null;
      created_at: Date;
    }>,
    jobsBySourceId: Map<string, AttachmentJob>,
  ) {
    if (!attachments.length) return [];

    return attachments.map((attachment) => {
      const extractedText = attachment.extracted_text?.trim() ?? '';
      const extractionFailed =
        attachment.extraction_status === 'failed' ||
        isAttachmentExtractionFallback(extractedText);
      const usableExtractedText = extractionFailed ? '' : extractedText;
      const job = jobsBySourceId.get(attachment.id);

      return {
        id: attachment.id,
        fileType: attachment.file_type,
        fileName: this.getStoredFileName(attachment.storage_path),
        extractionStatus: extractionFailed
          ? 'failed'
          : usableExtractedText
            ? 'extracted'
            : 'pending',
        extractionCompleteness: attachment.extraction_completeness ?? undefined,
        extractedTextPreview: usableExtractedText
          ? usableExtractedText.slice(0, 800)
          : undefined,
        extractedCharacterCount: usableExtractedText.length,
        indexingStatus: extractionFailed
          ? 'failed'
          : (job?.status ?? 'unknown'),
        indexingError: extractionFailed
          ? attachment.extraction_error ?? 'AI could not read this file. Retry the scan to extract its real content.'
          : (job?.error ?? null),
        retryCount: job?.retry_count ?? 0,
        updatedAt: (job?.updated_at ?? attachment.created_at).toISOString(),
        createdAt: attachment.created_at.toISOString(),
      };
    });
  }

  private async loadAttachmentJobs(
    attachments: Array<{ id: string }>,
  ): Promise<Map<string, AttachmentJob>> {
    if (!attachments.length) return new Map();

    const jobs = await this.prisma.indexingOutbox.findMany({
      where: {
        job_type: 'index_memory',
        source_type: 'attachment',
        source_id: { in: attachments.map((attachment) => attachment.id) },
      },
      select: {
        source_id: true,
        status: true,
        error: true,
        retry_count: true,
        updated_at: true,
      },
    });

    return new Map(jobs.map((job) => [job.source_id, job]));
  }

  private encodeCursor(cursor: DiaryCursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): DiaryCursor {
    try {
      const decoded = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as Partial<DiaryCursor>;
      if (
        typeof decoded.id !== 'string' ||
        typeof decoded.createdAt !== 'string' ||
        !Number.isFinite(new Date(decoded.createdAt).getTime())
      ) {
        throw new Error('Invalid cursor payload');
      }
      return { id: decoded.id, createdAt: decoded.createdAt };
    } catch {
      throw new BadRequestException('Invalid diary cursor');
    }
  }

  private emptyStatistics(
    type: 'weekly' | 'yearly',
    period: ReturnType<typeof getSummaryPeriod>,
  ) {
    return {
      period: type,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      timeZone: period.timeZone,
      totalEntries: 0,
      activeDays: 0,
      totalWords: 0,
      averageWordsPerActiveDay: 0,
      moodCounts: { great: 0, good: 0, neutral: 0, bad: 0 },
      topTags: [],
      days: [],
      availableYears: [Number(period.localStart.slice(0, 4))],
    };
  }

  private getStoredFileName(storagePath: string) {
    const storedName = storagePath.split('/').pop() ?? storagePath;
    return storedName.replace(/^[0-9a-f-]{36}-/i, '');
  }

  // ---------------------------------------------------------------------------
  // AI Writing Copilot
  // ---------------------------------------------------------------------------
  async copilot(userId: string, text: string, action: string) {
    const modelName = getTuturuuuAnswerModel();
    const systemContext = [
      'You are the AI Writing Copilot for a Smart Personal Diary app called "Second Brain".',
      'The user writes daily diary entries to record their thoughts, emotions, and activities.',
      'Always preserve the original language of the text (Vietnamese, English, or mixed).',
      'Never add greetings, meta-commentary, or markdown formatting — return only the resulting text.',
    ].join(' ');

    let taskInstruction: string;

    switch (action) {
      case 'continue':
        taskInstruction = [
          'Continue writing this diary entry naturally.',
          'Match the tone, style, and language of the original text.',
          'Write 2-4 additional sentences that logically follow.',
          'Return ONLY the continuation — do NOT repeat the original text.',
        ].join('\n');
        break;

      case 'fix_grammar':
        taskInstruction = [
          'Fix all grammar, spelling, and punctuation errors in this diary entry.',
          'Keep the original meaning, tone, and language exactly as intended.',
          'Return ONLY the corrected full text.',
        ].join('\n');
        break;

      case 'expand':
        taskInstruction = [
          'Expand this diary entry with more vivid details, sensory descriptions, and deeper reflection.',
          'Keep the original meaning and language.',
          'Roughly double the length while maintaining the authentic diary voice.',
          'Return ONLY the expanded full text.',
        ].join('\n');
        break;

      case 'summarize':
        taskInstruction = [
          'Summarize this diary entry into a concise 2-3 sentence overview.',
          'Capture the key events, emotions, and insights.',
          'Keep the same language as the original.',
          'Return ONLY the summary.',
        ].join('\n');
        break;

      case 'reflect':
        taskInstruction = [
          'Write one thoughtful, open-ended question that helps the author reflect more deeply on this specific diary entry.',
          'Ground the question in a concrete emotion, event, tension, or detail from the entry.',
          'Keep the same language as the original.',
          'Use one sentence and return ONLY the question.',
        ].join('\n');
        break;

      default:
        throw new BadRequestException(`Invalid copilot action: "${action}"`);
    }

    const prompt = `${systemContext}\n\n### Task\n${taskInstruction}\n\n### Diary Entry\n${text}`;

    try {
      const generatedText = await generateAiText({
        model: modelName,
        prompt,
        temperature: 0.7,
      });
      return { result: generatedText };
    } catch (error) {
      console.error(
        `Copilot AI Error [action=${action}, model=${modelName}]:`,
        error,
      );
      throw new InternalServerErrorException(
        'AI writing assistant is temporarily unavailable. Please try again.',
      );
    }
  }
}
