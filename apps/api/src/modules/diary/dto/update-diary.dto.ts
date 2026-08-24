import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { trimStringValue } from '../../../common/transforms/trim-string';
import { DIARY_MOODS } from './create-diary.dto';

export class UpdateDiaryDto {
  @IsOptional()
  @Transform(trimStringValue)
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @Transform(trimStringValue)
  @IsString()
  @IsNotEmpty()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsIn(DIARY_MOODS)
  mood?: (typeof DIARY_MOODS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];
}
