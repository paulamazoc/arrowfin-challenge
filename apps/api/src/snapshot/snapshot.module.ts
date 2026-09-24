import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SnapshotCalculator } from './snapshot.calculator.js';
import { SnapshotController } from './snapshot.controller.js';
import { SnapshotRepository } from './snapshot.repository.js';
import { SnapshotService } from './snapshot.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SnapshotController],
  providers: [
    SnapshotService,
    SnapshotRepository,
    {
      provide: SnapshotCalculator,
      useFactory: () => new SnapshotCalculator(),
    },
  ],
})
export class SnapshotModule {}
