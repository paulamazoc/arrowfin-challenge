import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/authenticated-identity.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import { DevAuthGuard } from '../auth/dev-auth.guard.js';
import { DevFillsService, type DevFillBody } from './dev-fills.service.js';

/**
 * Assessment/demo fill injector. Guarded to development/test only.
 * Production must not expose this endpoint.
 */
@Controller('dev/fills')
@UseGuards(DevAuthGuard)
export class DevFillsController {
  constructor(private readonly devFillsService: DevFillsService) {}

  @Post()
  injectFill(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() body: DevFillBody,
  ): Promise<{ id: string }> {
    return this.devFillsService.inject(identity, body);
  }
}
