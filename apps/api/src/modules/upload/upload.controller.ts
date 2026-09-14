// apps/api/src/upload/upload.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  deleteMemoryChunksForSource,
  markMemorySourcesChanged,
} from '@second-brain/db';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { StorageService } from '../../storage/storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { invalidateUserSearchCache } from '../../common/cache/search-answer-cache';
import {
  AUDIO_ATTACHMENT_MAX_BYTES,
  getAttachmentValidationError,
  isAttachmentExtractionFallback,
  SUPPORTED_ATTACHMENT_MIME_PATTERN,
} from './attachment-upload-policy';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('attachment')
  async listAttachments(@Request() req: { user: { userId: string } }) {
    const user = await this.findUserOrThrow(req.user.userId);
    const attachments = await this.prisma.attachment.findMany({
      where: {
        diary_entry: {
          user_id: user.id,
        },
      },
      include: {
        diary_entry: {
          select: {
            id: true,
            entry_date: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    });

    return {
      message: 'Use POST /api/upload/attachment to upload a diary attachment.',
      count: attachments.length,
      attachments: await Promise.all(
        attachments.map((attachment) => this.toClientAttachment(attachment)),
      ),
    };
  }

  @Get('attachment/:id')
  async findAttachment(
    @Request() req: { user: { userId: string } },
    @Param('id') attachmentId: string,
  ) {
    const user = await this.findUserOrThrow(req.user.userId);
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        diary_entry: {
          user_id: user.id,
        },
      },
      include: {
        diary_entry: {
          select: {
            id: true,
            entry_date: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found.');
    }

    return this.toClientAttachment(attachment);
  }

  @Get('attachment/:id/content')
  async downloadAttachment(
    @Request() req: { user: { userId: string } },
    @Param('id') attachmentId: string,
    @Res({ passthrough: true }) response: Response,
    @Headers('range') rangeHeader?: string,
  ) {
    const user = await this.findUserOrThrow(req.user.userId);
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        diary_entry: {
          user_id: user.id,
        },
      },
      select: {
        storage_path: true,
        file_type: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found.');
    }

    const content = await this.storageService.streamFile(
      'attachments-bucket',
      attachment.storage_path,
      rangeHeader,
    );
    const fileName = this.getStoredFileName(attachment.storage_path).replace(
      /["\r\n]/g,
      '_',
    );

    if (content.statusCode === HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE) {
      if (content.contentRange) {
        response.set('Content-Range', content.contentRange);
      }
      throw new HttpException(
        'Requested range is not satisfiable',
        HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
      );
    }
    response.set({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Type': attachment.file_type || 'application/octet-stream',
      ...(content.contentLength
        ? { 'Content-Length': content.contentLength }
        : {}),
      ...(content.contentRange
        ? { 'Content-Range': content.contentRange }
        : {}),
    });
    if (content.statusCode === HttpStatus.PARTIAL_CONTENT) {
      response.status(HttpStatus.PARTIAL_CONTENT);
    }

    return new StreamableFile(content.stream);
  }

  @Post('attachment')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AUDIO_ATTACHMENT_MAX_BYTES },
    }),
  )
  async uploadAttachment(
    @Request() req: { user: { userId: string } },
    @Body('diaryEntryId') diaryEntryId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: AUDIO_ATTACHMENT_MAX_BYTES }),
          new FileTypeValidator({
            fileType: SUPPORTED_ATTACHMENT_MIME_PATTERN,
            fallbackToMimetype: true,
            errorMessage:
              'Unsupported attachment content. Upload a supported document, image, or audio file.',
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!diaryEntryId) {
      throw new BadRequestException('diaryEntryId is required.');
    }

    const validationError = getAttachmentValidationError(file);
    if (validationError) {
      throw new BadRequestException(validationError);
    }

    const user = await this.findUserOrThrow(req.user.userId);

    const diaryEntry = await this.prisma.diaryEntry.findFirst({
      where: {
        id: diaryEntryId,
        user_id: user.id,
      },
      select: { id: true, entry_date: true },
    });

    if (!diaryEntry) {
      throw new NotFoundException('Diary entry not found.');
    }

    const uploadedFile = await this.storageService.uploadFile(
      file,
      'attachments-bucket',
      user.id,
    );

    const extractedText = this.extractPlainText(file);

    let attachment: any;
    try {
      attachment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.attachment.create({
          data: {
            diary_entry_id: diaryEntry.id,
            storage_path: uploadedFile.path,
            file_type: file.mimetype,
            ...(extractedText && { extracted_text: extractedText }),
            content_hash: createHash('sha256').update(file.buffer).digest('hex'),
            extraction_status: extractedText ? 'complete' : 'pending',
            extraction_completeness: extractedText ? 1 : null,
          },
        });

        await this.enqueueAttachmentIndexingJob(tx, {
          userId: user.id,
          attachmentId: created.id,
          sourceTitle: file.originalname,
        });
        await markMemorySourcesChanged(tx as any, {
          userId: user.id,
          occurredFrom: diaryEntry.entry_date,
          occurredTo: diaryEntry.entry_date,
        });

        return created;
      });
      await invalidateUserSearchCache(user.id);
    } catch (error) {
      await this.storageService
        .deleteFile('attachments-bucket', uploadedFile.path)
        .catch((deleteError) => {
          console.error(
            'Failed to remove orphaned uploaded file:',
            deleteError,
          );
        });
      throw error;
    }

    return {
      message: 'Upload successful',
      extractionStatus: extractedText ? 'extracted' : 'pending',
      memoryIndexed: false,
      memoryIndexingStatus: 'queued',
      memoryChunkCount: 0,
      attachment: await this.toClientAttachment(attachment),
    };
  }

  @Post('attachment/:id/process')
  async processAttachmentNow(
    @Request() req: { user: { userId: string } },
    @Param('id') attachmentId: string,
  ) {
    const user = await this.findUserOrThrow(req.user.userId);

    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        diary_entry: {
          user_id: user.id,
        },
      },
      include: {
        diary_entry: {
          select: {
            id: true,
            entry_date: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found.');
    }

    const requiresFreshExtraction =
      attachment.extraction_status === 'failed' ||
      isAttachmentExtractionFallback(attachment.extracted_text);
    await this.prisma.$transaction(async (tx) => {
      if (requiresFreshExtraction) {
        await tx.attachment.update({
          where: { id: attachment.id },
          data: {
            extracted_text: null,
            extraction_status: 'pending',
            extraction_completeness: null,
            extraction_error: null,
          },
        });
        await deleteMemoryChunksForSource(tx as any, {
          userId: user.id,
          sourceType: 'attachment',
          sourceId: attachment.id,
        });
        await markMemorySourcesChanged(tx as any, {
          userId: user.id,
          occurredFrom: attachment.diary_entry.entry_date,
          occurredTo: attachment.diary_entry.entry_date,
        });
      }

      await this.enqueueAttachmentIndexingJob(tx, {
        userId: user.id,
        attachmentId: attachment.id,
        sourceTitle: this.getStoredFileName(attachment.storage_path),
      });
    });
    await invalidateUserSearchCache(user.id);

    return {
      message: 'Attachment processing queued',
      extractionStatus:
        attachment.extracted_text && !requiresFreshExtraction
          ? 'extracted'
          : 'pending',
      memoryIndexed: false,
      memoryIndexingStatus: 'queued',
      memoryChunkCount: 0,
      attachment: await this.toClientAttachment({
        ...attachment,
        extracted_text: requiresFreshExtraction
          ? null
          : attachment.extracted_text,
      }),
    };
  }

  private extractPlainText(file: Express.Multer.File) {
    if (file.mimetype !== 'text/plain') {
      return null;
    }

    const text = file.buffer.toString('utf8').trim();
    return text.length > 0 ? text : null;
  }

  private async enqueueAttachmentIndexingJob(
    tx: any,
    input: {
      userId: string;
      attachmentId: string;
      sourceTitle: string;
    },
  ) {
    const job = await tx.indexingOutbox.upsert({
      where: {
        job_type_source_type_source_id: {
          job_type: 'index_memory',
          source_type: 'attachment',
          source_id: input.attachmentId,
        },
      },
      update: {
        user_id: input.userId,
        status: 'pending',
        retry_count: 0,
        error: null,
        payload: { sourceTitle: input.sourceTitle },
        generation: { increment: 1 },
        run_after: new Date(),
        locked_at: null,
        locked_by: null,
        processed_at: null,
      },
      create: {
        user_id: input.userId,
        job_type: 'index_memory',
        source_type: 'attachment',
        source_id: input.attachmentId,
        status: 'pending',
        payload: { sourceTitle: input.sourceTitle },
      },
    });

    await tx.searchHistory?.updateMany?.({
      where: {
        user_id: input.userId,
        expires_at: { gt: new Date() },
      },
      data: { expires_at: new Date() },
    });
    return job;
  }

  private getStoredFileName(storagePath: string) {
    return storagePath.split('/').pop() ?? storagePath;
  }

  private async findUserOrThrow(supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseId: supabaseUserId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  private async toClientAttachment(attachment: {
    id: string;
    diary_entry_id: string;
    storage_path: string;
    file_type: string;
    extracted_text: string | null;
    extraction_status?: string;
    extraction_completeness?: number | null;
    extraction_error?: string | null;
    created_at: Date;
    diary_entry?: {
      id: string;
      entry_date: Date;
    };
  }) {
    const extractedText = attachment.extracted_text?.trim() ?? '';
    const extractionFailed = isAttachmentExtractionFallback(extractedText);
    const usableExtractedText = extractionFailed ? '' : extractedText;
    const signedUrl =
      typeof this.storageService.createSignedUrl === 'function'
        ? await this.storageService
            .createSignedUrl('attachments-bucket', attachment.storage_path)
            .catch(() => undefined)
        : undefined;

    return {
      id: attachment.id,
      diaryEntryId: attachment.diary_entry_id,
      fileType: attachment.file_type,
      extractionStatus: attachment.extraction_status === 'failed' || extractionFailed
        ? 'failed'
        : usableExtractedText
          ? 'extracted'
          : 'pending',
      extractionCompleteness: attachment.extraction_completeness ?? undefined,
      extractionError: attachment.extraction_error ?? undefined,
      extractedTextPreview: usableExtractedText
        ? usableExtractedText.slice(0, 800)
        : undefined,
      extractedCharacterCount: usableExtractedText.length,
      signedUrl,
      createdAt: attachment.created_at.toISOString(),
      entryDate: attachment.diary_entry?.entry_date.toISOString(),
    };
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return 'Attachment processing failed.';
  }
}

type AttachmentIndexingResponse = {
  memoryIndexed: boolean;
  memoryChunkCount: number;
  processingError?: string;
};
