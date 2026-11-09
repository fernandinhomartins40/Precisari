import { Module } from '@nestjs/common';
import { ExplanationsService } from './explanations.service';

@Module({ providers: [ExplanationsService], exports: [ExplanationsService] })
export class ExplanationsModule {}
