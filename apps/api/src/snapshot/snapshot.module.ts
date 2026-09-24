import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DevFillsController } from './dev-fills.controller.js';
import { DevFillsService } from './dev-fills.service.js';
import { SnapshotCalculator } from './snapshot.calculator.js';
import { SnapshotController } from './snapshot.controller.js';
import { SnapshotGateway } from './snapshot.gateway.js';
import { SnapshotRepository } from './snapshot.repository.js';
import { SnapshotService } from './snapshot.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [SnapshotController, DevFillsController],
  providers: [
    SnapshotService,
    SnapshotRepository,
    SnapshotGateway,
    DevFillsService,
    {
      provide: SnapshotCalculator,
      useFactory: () => new SnapshotCalculator(),
    },
  ],
})
export class SnapshotModule {}
