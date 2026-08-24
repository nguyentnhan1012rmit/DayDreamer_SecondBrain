import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { SearchQueryDto } from './search-query.dto';

describe('SearchQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true });
  const metadata = {
    type: 'body',
    metatype: SearchQueryDto,
  } as ArgumentMetadata;

  it('trims a valid question', async () => {
    await expect(
      pipe.transform({ question: '  What happened today?  ' }, metadata),
    ).resolves.toMatchObject({ question: 'What happened today?' });
  });

  it('rejects a whitespace-only question', async () => {
    await expect(
      pipe.transform({ question: '   ' }, metadata),
    ).rejects.toThrow();
  });
});
