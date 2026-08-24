import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { CreateDiaryDto } from './create-diary.dto';
import { UpdateDiaryDto } from './update-diary.dto';

describe('Diary DTO validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('accepts a partial update and trims text fields', async () => {
    await expect(
      validate(UpdateDiaryDto, {
        title: '  Revised title  ',
        tags: ['capstone'],
      }),
    ).resolves.toEqual({
      title: 'Revised title',
      tags: ['capstone'],
    });
  });

  it.each([
    [{ title: 42 }],
    [{ title: '   ' }],
    [{ mood: 'wonderful' }],
    [{ tags: 'capstone' }],
    [{ entryDate: 'not-a-date' }],
    [{ unexpected: true }],
  ])('rejects an invalid PATCH body: %p', async (body) => {
    await expect(validate(UpdateDiaryDto, body)).rejects.toThrow();
  });

  it('rejects whitespace-only text when creating a diary', async () => {
    await expect(
      validate(CreateDiaryDto, {
        title: '   ',
        content: 'A valid entry',
      }),
    ).rejects.toThrow();
  });

  function validate(
    metatype: typeof CreateDiaryDto | typeof UpdateDiaryDto,
    value: unknown,
  ) {
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype,
    };
    return pipe.transform(value, metadata);
  }
});
