import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/authenticated-identity.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import { DevAuthGuard } from '../auth/dev-auth.guard.js';
import { SnapshotService } from './snapshot.service.js';
import type { SnapshotResult } from './snapshot.types.js';

@Controller('snapshot')
@UseGuards(DevAuthGuard)
export class SnapshotController {
  constructor(private readonly snapshotService: SnapshotService) {}

  @Get()
  getSnapshot(
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<SnapshotResult> {
    return this.snapshotService.getSnapshot(identity);
  }
}
