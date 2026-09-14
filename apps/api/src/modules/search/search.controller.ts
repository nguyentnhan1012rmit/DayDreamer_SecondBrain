import { Body, Controller, Delete, Get, Param, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequestUser } from '../auth/user-role';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  async ask(
    @Request() req: { user: AuthenticatedRequestUser },
    @Body() queryDto: SearchQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.searchService.answerQuestion(req.user, queryDto);
    setSearchServerTiming(response, result);
    return result;
  }

  @Get('history')
  async getHistory(@Request() req) {
    return this.searchService.getHistory(req.user.userId);
  }

  @Delete('history')
  async clearHistory(@Request() req) {
    return this.searchService.clearHistory(req.user.userId);
  }

  @Delete('history/:id')
  async deleteHistoryItem(@Request() req, @Param('id') id: string) {
    return this.searchService.deleteHistoryItem(req.user.userId, id);
  }

  @Get()
  async find(
    @Request() req: { user: AuthenticatedRequestUser },
    @Query() queryDto: SearchQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.searchService.answerQuestion(req.user, queryDto);
    setSearchServerTiming(response, result);
    return result;
  }
}

function setSearchServerTiming(
  response: Response,
  result: { analytics?: unknown },
) {
  if (!result.analytics || typeof result.analytics !== 'object') return;
  const timing = (result.analytics as { timing?: unknown }).timing;
  if (!timing || typeof timing !== 'object') return;
  const valuesByName = timing as Record<string, unknown>;
  const values = [
    ['embed', valuesByName.embedMs],
    ['retrieve', valuesByName.retrieveMs],
    ['rerank', valuesByName.rerankMs],
    ['first-result', valuesByName.firstResultMs],
    ['full-answer', valuesByName.fullAnswerMs ?? valuesByName.totalMs],
  ]
    .filter((entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    )
    .map(([name, duration]) => `${name};dur=${Math.max(0, duration).toFixed(1)}`);
  if (values.length) response.setHeader('Server-Timing', values.join(', '));
}
