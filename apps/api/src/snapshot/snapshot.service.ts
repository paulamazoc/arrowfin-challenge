import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/authenticated-identity.js';
import { SnapshotCalculator } from './snapshot.calculator.js';
import { SnapshotRepository } from './snapshot.repository.js';
import type { SnapshotResult } from './snapshot.types.js';

@Injectable()
export class SnapshotService {
  constructor(
    private readonly repository: SnapshotRepository,
    private readonly calculator: SnapshotCalculator,
  ) {}

  async getSnapshot(identity: AuthenticatedIdentity): Promise<SnapshotResult> {
    const input = await this.repository.findSnapshotInput(identity);
    if (!input) {
      throw new NotFoundException();
    }

    return this.calculator.calculate(input);
  }
}
