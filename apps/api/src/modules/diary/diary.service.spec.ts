import { BadRequestException, NotFoundException } from '@nestjs/common';
import { generateAiText } from '@second-brain/ai';
import { DiaryService } from './diary.service';

// Mock the external AI/DB functions so tests don't call real APIs
jest.mock('@second-brain/ai', () => ({
  indexMemoryFromDiary: jest.fn().mockResolvedValue({ chunkCount: 2 }),
  generateAiText: jest
    .fn()
    .mockResolvedValue('What part of this moment do you want to remember?'),
  getTuturuuuAnswerModel: jest.fn().mockReturnValue('test-answer-model'),
  getSummaryPeriod: jest.fn().mockReturnValue({
    start: new Date('2026-01-01T00:00:00.000Z'),
    end: new Date('2026-12-31T23:59:59.999Z'),
    timeZone: 'UTC',
    localStart: '2026-01-01',
    localEnd: '2026-12-31',
  }),
}));
jest.mock('@second-brain/db', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
  },
  insertMemoryChunks: jest.fn(),
  pruneMemoryChunksForSource: jest.fn(),
  deleteMemoryChunksForSource: jest.fn(),
  markMemorySourcesChanged: jest.fn().mockResolvedValue(1n),
}));

describe('DiaryService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    diaryEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    indexingOutbox: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  const storageService = {
    createSignedUrl: jest.fn(),
  };

  let service: DiaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    storageService.createSignedUrl.mockImplementation(
      async (_bucket: string, path: string) => `https://storage.local/${path}`,
    );
    prisma.indexingOutbox.findMany.mockResolvedValue([]);
    service = new DiaryService(prisma as any);
  });

  it('creates one grounded reflection question for a saved entry', async () => {
    const result = await service.copilot(
      'supabase-user-1',
      'Finished the presentation and felt relieved.',
      'reflect',
    );

    expect(result).toEqual({
      result: 'What part of this moment do you want to remember?',
    });
    expect(generateAiText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-answer-model',
        prompt: expect.stringContaining(
          'Write one thoughtful, open-ended question',
        ),
      }),
    );
  });

  it('creates a diary for the authenticated user and queues memory indexing', async () => {
    const entryDate = new Date('2026-05-18T09:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.create.mockResolvedValue({
      id: 'diary-1',
      raw_text: 'Title\n\nContent',
      status: 'published',
      created_at: entryDate,
      updated_at: entryDate,
      entry_date: entryDate,
    });

    const result = await service.create('supabase-user-1', {
      title: 'Title',
      content: 'Content',
    });

    expect(prisma.diaryEntry.create).toHaveBeenCalledWith({
      data: {
        raw_text: 'Title\n\nContent',
        user_id: 'user-1',
        status: 'published',
        tags: [],
      },
    });
    expect(result).toMatchObject({
      id: 'diary-1',
      title: 'Title',
      content: 'Content',
      memoryIndexed: false,
      memoryIndexingStatus: 'queued',
    });
    expect(prisma.indexingOutbox.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          job_type_source_type_source_id: {
            job_type: 'index_memory',
            source_type: 'diary',
            source_id: 'diary-1',
          },
        },
      }),
    );
  });

  it('stores an explicit diary entry date when provided', async () => {
    const createdAt = new Date('2026-05-18T09:00:00.000Z');
    const explicitEntryDate = '2026-05-12T12:00:00.000Z';
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.create.mockResolvedValue({
      id: 'diary-2',
      raw_text: 'Backdated\n\nContent',
      status: 'published',
      created_at: createdAt,
      updated_at: createdAt,
      entry_date: new Date(explicitEntryDate),
    });

    const result = await service.create('supabase-user-1', {
      title: 'Backdated',
      content: 'Content',
      entryDate: explicitEntryDate,
    });

    expect(prisma.diaryEntry.create).toHaveBeenCalledWith({
      data: {
        raw_text: 'Backdated\n\nContent',
        user_id: 'user-1',
        status: 'published',
        tags: [],
        entry_date: new Date(explicitEntryDate),
      },
    });
    expect(result).toMatchObject({
      id: 'diary-2',
      entryDate: explicitEntryDate,
    });
  });

  it('stores an explicit diary entry date when provided', async () => {
    const createdAt = new Date('2026-05-18T09:00:00.000Z');
    const explicitEntryDate = '2026-05-12T12:00:00.000Z';
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.create.mockResolvedValue({
      id: 'diary-2',
      raw_text: 'Backdated\n\nContent',
      status: 'published',
      created_at: createdAt,
      updated_at: createdAt,
      entry_date: new Date(explicitEntryDate),
    });

    const result = await service.create('supabase-user-1', {
      title: 'Backdated',
      content: 'Content',
      entryDate: explicitEntryDate,
    });

    expect(prisma.diaryEntry.create).toHaveBeenCalledWith({
      data: {
        raw_text: 'Backdated\n\nContent',
        user_id: 'user-1',
        status: 'published',
        tags: [],
        entry_date: new Date(explicitEntryDate),
      },
    });
    expect(result).toMatchObject({
      id: 'diary-2',
      entryDate: explicitEntryDate,
    });
  });

  it('does not create a diary when the authenticated user is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-user', { title: 'Title', content: 'Content' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.diaryEntry.create).not.toHaveBeenCalled();
  });

  it('scopes diary listing by the resolved internal user id', async () => {
    const createdAt = new Date('2026-05-18T09:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.findMany.mockResolvedValue([
      {
        id: 'diary-1',
        raw_text: 'Title\n\nContent',
        status: 'published',
        created_at: createdAt,
        updated_at: createdAt,
      },
    ]);

    const result = await service.findAll('supabase-user-1');

    expect(prisma.diaryEntry.findMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
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
      take: 26,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: 'diary-1', title: 'Title' });
    expect(result).toMatchObject({ nextCursor: null, hasMore: false });
  });

  it('pushes timeline date filtering into the diary query', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.findMany.mockResolvedValue([]);

    await service.findAll('supabase-user-1', {
      startDate: '2026-05-18T00:00:00.000Z',
      endDate: '2026-05-18T23:59:59.999Z',
    });

    expect(prisma.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 'user-1',
          entry_date: {
            gte: new Date('2026-05-18T00:00:00.000Z'),
            lte: new Date('2026-05-18T23:59:59.999Z'),
          },
        },
      }),
    );
  });

  it('rejects invalid or reversed timeline date ranges', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(
      service.findAll('supabase-user-1', { startDate: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.findAll('supabase-user-1', {
        startDate: '2026-05-19T00:00:00.000Z',
        endDate: '2026-05-18T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.diaryEntry.findMany).not.toHaveBeenCalled();
  });

  it('normalizes and returns diary mood and tags', async () => {
    const createdAt = new Date('2026-05-18T09:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.create.mockResolvedValue({
      id: 'diary-3',
      raw_text: 'Mood day\n\nHad a strong focus block.',
      status: 'published',
      mood: 'great',
      tags: ['capstone', 'focus-block'],
      created_at: createdAt,
      updated_at: createdAt,
      entry_date: createdAt,
    });

    const result = await service.create('supabase-user-1', {
      title: 'Mood day',
      content: 'Had a strong focus block.',
      mood: 'great',
      tags: [' Capstone ', '#Focus Block', 'capstone', 'bad tag!'],
    });

    expect(prisma.diaryEntry.create).toHaveBeenCalledWith({
      data: {
        raw_text: 'Mood day\n\nHad a strong focus block.',
        user_id: 'user-1',
        status: 'published',
        mood: 'great',
        tags: ['capstone', 'focus-block', 'bad-tag'],
      },
    });
    expect(result).toMatchObject({
      mood: 'great',
      tags: ['capstone', 'focus-block'],
    });
    expect(prisma.indexingOutbox.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          payload: {
            sourceTitle: 'Mood day',
            mood: 'great',
            tags: ['capstone', 'focus-block', 'bad-tag'],
          },
        }),
      }),
    );
  });

  it('batch-loads attachment jobs without signing timeline urls', async () => {
    const createdAt = new Date('2026-05-18T09:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.findMany.mockResolvedValue([
      {
        id: 'diary-1',
        raw_text: 'Title\n\nContent',
        status: 'published',
        created_at: createdAt,
        updated_at: createdAt,
        attachments: [
          {
            id: 'attachment-1',
            storage_path:
              'attachments/user-1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-file.pdf',
            file_type: 'application/pdf',
            extracted_text: 'Extracted text',
            created_at: createdAt,
          },
        ],
      },
    ]);
    prisma.indexingOutbox.findMany.mockResolvedValue([
      {
        source_id: 'attachment-1',
        status: 'succeeded',
        error: null,
        retry_count: 0,
        updated_at: createdAt,
      },
    ]);

    const result = await service.findAll('supabase-user-1');

    expect(storageService.createSignedUrl).not.toHaveBeenCalled();
    expect(prisma.indexingOutbox.findMany).toHaveBeenCalledTimes(1);
    expect(result.entries[0].attachments).toEqual([
      expect.objectContaining({
        id: 'attachment-1',
        fileName: 'file.pdf',
        extractionStatus: 'extracted',
        extractedTextPreview: 'Extracted text',
        extractedCharacterCount: 14,
        indexingStatus: 'succeeded',
      }),
    ]);
  });

  it('returns a stable cursor when another page is available', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => ({
        id: `diary-${3 - index}`,
        raw_text: `Title ${index}\n\nContent`,
        status: 'published',
        created_at: new Date(`2026-05-1${3 - index}T09:00:00.000Z`),
        updated_at: new Date(`2026-05-1${3 - index}T09:00:00.000Z`),
        attachments: [],
        calendar_events: [],
      })),
    );

    const result = await service.findAll('supabase-user-1', { limit: 2 });

    expect(result.entries.map((entry) => entry.id)).toEqual([
      'diary-3',
      'diary-2',
    ]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(prisma.diaryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });

  it('keeps a 25-entry timeline page bounded with one attachment-job query', async () => {
    const createdAt = new Date('2026-05-18T09:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.diaryEntry.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => ({
        id: `diary-${index}`,
        raw_text: `Memory ${index}\n\n${'A useful diary sentence. '.repeat(40)}`,
        status: 'published',
        mood: 'good',
        tags: ['focus'],
        created_at: new Date(createdAt.getTime() - index * 60_000),
        updated_at: createdAt,
        attachments: [
          {
            id: `attachment-${index}`,
            storage_path: `attachments/user-1/file-${index}.pdf`,
            file_type: 'application/pdf',
            extracted_text: 'Extracted document context. '.repeat(20),
            created_at: createdAt,
          },
        ],
        calendar_events: [],
      })),
    );
    prisma.indexingOutbox.findMany.mockResolvedValue([]);

    const result = await service.findAll('supabase-user-1');
    const payloadBytes = Buffer.byteLength(JSON.stringify(result));

    expect(result.entries).toHaveLength(25);
    expect(prisma.indexingOutbox.findMany).toHaveBeenCalledTimes(1);
    expect(storageService.createSignedUrl).not.toHaveBeenCalled();
    expect(payloadBytes).toBeLessThan(300 * 1024);
  });

  it('aggregates yearly statistics without loading attachments', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.$queryRaw.mockResolvedValue([
      {
        totalEntries: 2,
        activeDays: 1,
        totalWords: 6,
        moodCounts: { great: 1, good: 1 },
        topTags: [
          { tag: 'focus', count: 2 },
          { tag: 'health', count: 1 },
        ],
        days: [{ date: '2026-05-18', entryCount: 2, wordCount: 6 }],
        availableYears: [2024, 2026, 2025],
      },
    ]);

    const result = await service.getStatistics('supabase-user-1', {
      period: 'yearly',
      anchor: '2026-05-18T12:00:00.000Z',
      timeZone: 'UTC',
    });

    expect(result).toMatchObject({
      totalEntries: 2,
      activeDays: 1,
      totalWords: 6,
      moodCounts: { great: 1, good: 1, neutral: 0, bad: 0 },
      topTags: [
        { tag: 'focus', count: 2 },
        { tag: 'health', count: 1 },
      ],
      availableYears: [2026, 2025, 2024],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.diaryEntry.findMany).not.toHaveBeenCalled();
  });

  describe('toClientEntry robust parsing fallbacks', () => {
    it('correctly handles default double newline format', async () => {
      const entryDate = new Date('2026-05-18T09:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.diaryEntry.findMany.mockResolvedValue([
        {
          id: 'diary-1',
          raw_text:
            'A Beautiful Day\n\nI went to the park and had a great time.',
          status: 'published',
          created_at: entryDate,
          updated_at: entryDate,
        },
      ]);
      const result = await service.findAll('supabase-user-1');
      expect(result.entries[0]).toMatchObject({
        title: 'A Beautiful Day',
        content: 'I went to the park and had a great time.',
      });
    });

    it('gracefully falls back to single newline if double newline is missing', async () => {
      const entryDate = new Date('2026-05-18T09:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.diaryEntry.findMany.mockResolvedValue([
        {
          id: 'diary-2',
          raw_text:
            'Single Newline Title\nThis is content on a single newline.',
          status: 'published',
          created_at: entryDate,
          updated_at: entryDate,
        },
      ]);
      const result = await service.findAll('supabase-user-1');
      expect(result.entries[0]).toMatchObject({
        title: 'Single Newline Title',
        content: 'This is content on a single newline.',
      });
    });

    it('uses the whole text as title if it has no newlines and is short', async () => {
      const entryDate = new Date('2026-05-18T09:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.diaryEntry.findMany.mockResolvedValue([
        {
          id: 'diary-3',
          raw_text: 'Just a short note with no newlines',
          status: 'published',
          created_at: entryDate,
          updated_at: entryDate,
        },
      ]);
      const result = await service.findAll('supabase-user-1');
      expect(result.entries[0]).toMatchObject({
        title: 'Just a short note with no newlines',
        content: 'Just a short note with no newlines',
      });
    });

    it('truncates the title and retains full text as content if no newlines and long text', async () => {
      const entryDate = new Date('2026-05-18T09:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.diaryEntry.findMany.mockResolvedValue([
        {
          id: 'diary-4',
          raw_text:
            'This is a very long diary entry without any newline characters because the user typed a long single line stream of conscious thoughts containing a lot of details.',
          status: 'published',
          created_at: entryDate,
          updated_at: entryDate,
        },
      ]);
      const result = await service.findAll('supabase-user-1');
      expect(result.entries[0].title).toBe(
        'This is a very long diary entry without any newline chara...',
      );
      expect(result.entries[0].content).toBe(
        'This is a very long diary entry without any newline characters because the user typed a long single line stream of conscious thoughts containing a lot of details.',
      );
    });
  });
});
