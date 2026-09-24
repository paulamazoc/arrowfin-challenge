import { NotFoundException } from '@nestjs/common';
import { SnapshotCalculator } from './snapshot.calculator.js';
import { SnapshotService } from './snapshot.service.js';
import type { SnapshotInput, SnapshotResult } from './snapshot.types.js';
import { DATASET_CURRENT_SESSION_DATE, DATASET_NOW } from './snapshot.constants.js';

const identity = { traderId: 'T-001', brokerId: 'BRK-ARWP' };

const snapshotInput: SnapshotInput = {
  accounts: [{ id: 'ACC-1001', balance: 10_000 }],
  fills: [],
  instruments: [],
  marketPrices: [],
  currentSessionDate: DATASET_CURRENT_SESSION_DATE,
  asOf: DATASET_NOW,
};

describe('SnapshotService', () => {
  it('passes the authenticated identity to the repository and calculator', async () => {
    const result = {
      accountBalance: 10_000,
      positions: [],
      realizedPnl: 0,
      unrealizedPnl: 0,
      commissions: 0,
      dayPnl: 0,
      positionsNotional: 0,
      riskScore: 0,
      asOf: DATASET_NOW,
    } satisfies SnapshotResult;

    const repository = {
      findSnapshotInput: vi.fn().mockResolvedValue(snapshotInput),
    };
    const calculator = {
      calculate: vi.fn().mockReturnValue(result),
    };

    const service = new SnapshotService(
      repository as never,
      calculator as unknown as SnapshotCalculator,
    );

    await expect(service.getSnapshot(identity)).resolves.toEqual(result);
    expect(repository.findSnapshotInput).toHaveBeenCalledWith(identity);
    expect(calculator.calculate).toHaveBeenCalledWith(snapshotInput);
  });

  it('returns generic NotFound when the tenant-scoped trader lookup misses', async () => {
    const repository = {
      findSnapshotInput: vi.fn().mockResolvedValue(null),
    };
    const calculator = {
      calculate: vi.fn(),
    };
    const service = new SnapshotService(
      repository as never,
      calculator as unknown as SnapshotCalculator,
    );

    await expect(service.getSnapshot(identity)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calculator.calculate).not.toHaveBeenCalled();
  });
});
