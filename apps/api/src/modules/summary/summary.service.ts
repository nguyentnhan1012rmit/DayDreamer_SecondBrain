import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  sanitizeSummaryContent,
  SummaryGenerationEngine,
  type SummaryEngineStore,
} from '@second-brain/ai';
import {
  bumpUserMemoryRevision,
  deleteMemoryChunksForSource,
  getUserMemoryRevision,
  markDependentSummariesDirty,
  withPostgresAdvisoryLock,
} from '@second-brain/db';
import { PrismaService } from '../../prisma/prisma.service';
import { invalidateUserSearchCache } from '../../common/cache/search-answer-cache';
import type { CreateSummaryDto } from './dto/create-summary.dto';
import type { SummaryType } from './dto/list-summaries-query.dto';

type SummaryRecord = {
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

type GenerateSummaryInput = {
  type: SummaryType;
  date?: string;
  force?: boolean;
};

type AuthenticatedUserInput = {
  supabaseId: string;
  email: string;
};

@Injectable()
export class SummaryService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    authUser: AuthenticatedUserInput | string,
    options: {
      type?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    },
  ) {
    const user = await this.findOrCreateUser(authUser);

    const summaries = await this.prisma.summary.findMany({
      where: {
        user_id: user.id,
        dirty: false,
        ...(options.type && { summary_type: options.type }),
        ...(options.startDate || options.endDate
          ? {
              period_start: {
                ...(options.startDate && { gte: new Date(options.startDate) }),
                ...(options.endDate && { lte: new Date(options.endDate) }),
              },
            }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take: options.limit ?? 20,
    });

    return {
      count: summaries.length,
      summaries: summaries.map((summary) => this.toClientSummary(summary)),
    };
  }

  async findOne(authUser: AuthenticatedUserInput | string, summaryId: string) {
    const user = await this.findOrCreateUser(authUser);

    const summary = await this.prisma.summary.findFirst({
      where: {
        id: summaryId,
        user_id: user.id,
        dirty: false,
      },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    return this.toClientSummary(summary);
  }

  async generateSummary(
    authUser: AuthenticatedUserInput | string,
    dto: CreateSummaryDto,
  ) {
    const user = await this.findOrCreateUser(authUser);
    return this.generateSummaryForUserId(user.id, dto);
  }

  async generateSummaryForUserId(userId: string, input: GenerateSummaryInput) {
    const anchorDate = input.date ? new Date(input.date) : new Date();
    if (!Number.isFinite(anchorDate.getTime())) {
      throw new BadRequestException('Invalid summary date.');
    }
    let result;
    try {
      result = await this.createSummaryEngine().generate({
        userId,
        type: input.type,
        anchorDate,
        force: input.force,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'AI returned an empty summary.'
      ) {
        throw new InternalServerErrorException(error.message);
      }
      throw error;
    }

    if (result.status === 'empty') {
      throw new BadRequestException(
        `No diary, calendar, or lower-level summaries found for this ${input.type} period.`,
      );
    }
    if (result.status === 'locked' || !result.summary) {
      throw new ConflictException(
        'This summary is already being generated. Try again shortly.',
      );
    }

    return {
      generated: result.status === 'generated',
      stale: result.status === 'stale',
      summary: this.toClientSummary(result.summary),
      memoryIndexingStatus:
        result.status === 'stale' ? 'waiting_for_regeneration' : 'queued',
    };
  }

  private createSummaryEngine() {
    const store: SummaryEngineStore = {
      findExisting: ({ userId, type, period }) =>
        this.prisma.summary.findFirst({
          where: {
            user_id: userId,
            summary_type: type,
            period_start: period.start,
            period_end: period.end,
          },
        }),
      findLowerSummaries: ({ userId, type, period }) =>
        this.prisma.summary.findMany({
          where: {
            user_id: userId,
            summary_type: type,
            dirty: false,
            period_start: { gte: period.start },
            period_end: { lte: period.end },
          },
          orderBy: { period_start: 'asc' },
        }),
      findActivity: async ({ userId, period, limit, coveredRanges }) => {
        const dateWhere = (field: string) => ({
          AND: [
            { [field]: { gte: period.start, lte: period.end } },
            ...coveredRanges.map((range) => ({
              OR: [
                { [field]: { lt: range.start } },
                { [field]: { gt: range.end } },
              ],
            })),
          ],
        });
        const [diaries, events, attachments, gmail, drive, contacts] =
          await Promise.all([
          this.prisma.diaryEntry.findMany({
            where: {
              user_id: userId,
              ...dateWhere('entry_date'),
            },
            orderBy: { entry_date: 'asc' },
            take: limit,
          }),
          this.prisma.calendarEvent.findMany({
            where: {
              user_id: userId,
              ...dateWhere('start_time'),
            },
            orderBy: { start_time: 'asc' },
            take: limit,
          }),
          this.prisma.attachment.findMany({
            where: {
              extracted_text: { not: null },
              diary_entry: {
                user_id: userId,
                ...dateWhere('entry_date'),
              },
            },
            include: { diary_entry: { select: { entry_date: true } } },
            orderBy: { created_at: 'asc' },
            take: limit,
          }),
          this.prisma.gmailMessage.findMany({
            where: { user_id: userId, ...dateWhere('received_at') },
            orderBy: { received_at: 'asc' },
            take: limit,
          }),
          this.prisma.googleDriveFile.findMany({
            where: {
              user_id: userId,
              extracted_text: { not: null },
              ...dateWhere('modified_time'),
            },
            orderBy: { modified_time: 'asc' },
            take: limit,
          }),
          this.prisma.googleContact.findMany({
            where: { user_id: userId, ...dateWhere('updated_at') },
            orderBy: { updated_at: 'asc' },
            take: limit,
          }),
        ]);
        return {
          diaries,
          events,
          attachments: attachments.map((attachment) => ({
            occurred_at: attachment.diary_entry.entry_date,
            extracted_text: attachment.extracted_text!,
            file_type: attachment.file_type,
            source_title: attachment.storage_path.split('/').pop(),
          })),
          gmail: gmail
            .filter((message) => message.received_at)
            .map((message) => ({
              received_at: message.received_at!,
              sender: message.sender,
              subject: message.subject,
              body: message.body,
            })),
          drive: drive
            .filter((file) => file.modified_time)
            .map((file) => ({
              occurred_at: file.modified_time!,
              name: file.name,
              extracted_text: file.extracted_text!,
            })),
          contacts: contacts.map((contact) => ({
            occurred_at: contact.updated_at,
            display_name: contact.display_name,
            email_addresses: contact.email_addresses,
            organizations: contact.organizations,
          })),
        };
      },
      getSourceVersion: (userId) =>
        getUserMemoryRevision(this.prisma as any, userId),
      save: ({ userId, type, period, content, sourceVersion }) =>
        this.prisma.$transaction(async (tx) => {
          const currentVersion = await getUserMemoryRevision(tx as any, userId);
          let dirty = currentVersion !== sourceVersion;
          if (!dirty) {
            const persistedVersion = await bumpUserMemoryRevision(
              tx as any,
              userId,
            );
            dirty = persistedVersion !== sourceVersion + 1n;
          }
          const summary = await tx.summary.upsert({
            where: {
              user_id_summary_type_period_start_period_end: {
                user_id: userId,
                summary_type: type,
                period_start: period.start,
                period_end: period.end,
              },
            },
            update: { content, source_version: sourceVersion, dirty },
            create: {
              user_id: userId,
              summary_type: type,
              period_start: period.start,
              period_end: period.end,
              content,
              source_version: sourceVersion,
              dirty,
            },
          });
          await markDependentSummariesDirty(tx as any, {
            userId,
            summaryType: type,
            periodStart: period.start,
            periodEnd: period.end,
          });
          await deleteMemoryChunksForSource(tx as any, {
            userId,
            sourceType: 'summary',
            sourceId: summary.id,
          });
          if (!dirty) {
            await this.enqueueSummaryIndexingJob(tx, {
              userId,
              summaryId: summary.id,
            });
          }
          return summary;
        }),
      ensureIndexed: async (summary, userId) => {
        await this.enqueueSummaryIndexingJob(this.prisma, {
          userId,
          summaryId: summary.id,
        });
      },
    };

    return new SummaryGenerationEngine(store, {
      contextItemLimit: Number(process.env.SUMMARY_CONTEXT_ITEM_LIMIT ?? 80),
      contextMaxChars: Number(process.env.SUMMARY_CONTEXT_MAX_CHARS ?? 24_000),
      withLock: (key, callback) => withPostgresAdvisoryLock(key, callback),
    });
  }

  private async findOrCreateUser(authUser: AuthenticatedUserInput | string) {
    if (typeof authUser === 'string') {
      const user = await this.prisma.user.findUnique({
        where: { supabaseId: authUser },
        select: { id: true },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    }

    return this.prisma.user.upsert({
      where: { supabaseId: authUser.supabaseId },
      update: { email: authUser.email },
      create: {
        supabaseId: authUser.supabaseId,
        email: authUser.email,
      },
      select: { id: true },
    });
  }

  private async enqueueSummaryIndexingJob(
    tx: any,
    input: {
      userId: string;
      summaryId: string;
    },
  ) {
    const job = await tx.indexingOutbox.upsert({
      where: {
        job_type_source_type_source_id: {
          job_type: 'index_memory',
          source_type: 'summary',
          source_id: input.summaryId,
        },
      },
      update: {
        user_id: input.userId,
        status: 'pending',
        retry_count: 0,
        error: null,
        payload: {},
        generation: { increment: 1 },
        run_after: new Date(),
        locked_at: null,
        locked_by: null,
        processed_at: null,
      },
      create: {
        user_id: input.userId,
        job_type: 'index_memory',
        source_type: 'summary',
        source_id: input.summaryId,
        status: 'pending',
        payload: {},
      },
    });

    await this.expireSearchCache(tx, input.userId);
    return job;
  }

  private async expireSearchCache(tx: any, userId: string) {
    await tx.searchHistory?.updateMany?.({
      where: {
        user_id: userId,
        expires_at: { gt: new Date() },
      },
      data: { expires_at: new Date() },
    });
    await invalidateUserSearchCache(userId);
  }

  private toClientSummary(summary: SummaryRecord) {
    return {
      id: summary.id,
      type: summary.summary_type,
      content: sanitizeSummaryContent(summary.content),
      periodStart:
        summary.period_start?.toISOString?.() ?? summary.period_start,
      periodEnd: summary.period_end?.toISOString?.() ?? summary.period_end,
      createdAt: summary.created_at?.toISOString?.() ?? summary.created_at,
      updatedAt: summary.updated_at?.toISOString?.() ?? summary.updated_at,
      dirty: summary.dirty,
    };
  }
}
