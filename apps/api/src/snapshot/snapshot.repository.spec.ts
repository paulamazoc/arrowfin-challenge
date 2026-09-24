import { SnapshotRepository } from './snapshot.repository.js';
import { DATASET_NOW } from './snapshot.constants.js';

const identity = { traderId: 'T-001', brokerId: 'BRK-ARWP' };

function createPrisma() {
  return {
    trader: { findFirst: vi.fn() },
    account: { findMany: vi.fn() },
    fill: { findMany: vi.fn() },
    instrument: { findMany: vi.fn() },
    marketPrice: { findMany: vi.fn() },
  };
}

describe('SnapshotRepository', () => {
  it('looks up the trader with both traderId and brokerId', async () => {
    const prisma = createPrisma();
    prisma.trader.findFirst.mockResolvedValue(null);
    const repository = new SnapshotRepository(prisma as never);

    await repository.findSnapshotInput(identity);

    expect(prisma.trader.findFirst).toHaveBeenCalledWith({
      where: {
        id: identity.traderId,
        brokerId: identity.brokerId,
      },
      select: { id: true },
    });
    expect(prisma.account.findMany).not.toHaveBeenCalled();
  });

  it('returns null for a valid trader ID under the wrong broker', async () => {
    const prisma = createPrisma();
    prisma.trader.findFirst.mockResolvedValue(null);
    const repository = new SnapshotRepository(prisma as never);

    await expect(
      repository.findSnapshotInput({
        traderId: 'T-001',
        brokerId: 'BRK-SMPT',
      }),
    ).resolves.toBeNull();

    expect(prisma.trader.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'T-001', brokerId: 'BRK-SMPT' },
      }),
    );
    expect(prisma.trader.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'T-001' },
      }),
    );
  });

  it('excludes closed accounts from the account query', async () => {
    const prisma = createPrisma();
    prisma.trader.findFirst.mockResolvedValue({ id: 'T-001' });
    prisma.account.findMany.mockResolvedValue([]);
    prisma.instrument.findMany.mockResolvedValue([]);
    prisma.marketPrice.findMany.mockResolvedValue([]);
    const repository = new SnapshotRepository(prisma as never);

    await repository.findSnapshotInput(identity);

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        traderId: 'T-001',
        status: { in: ['active', 'restricted'] },
      },
      select: {
        id: true,
        balance: true,
      },
    });
    expect(prisma.fill.findMany).not.toHaveBeenCalled();
  });

  it('loads fills only for included accounts up to dataset now', async () => {
    const prisma = createPrisma();
    prisma.trader.findFirst.mockResolvedValue({ id: 'T-001' });
    prisma.account.findMany.mockResolvedValue([
      { id: 'ACC-1001', balance: { toString: () => '10000.00' } },
    ]);
    prisma.fill.findMany.mockResolvedValue([]);
    prisma.instrument.findMany.mockResolvedValue([]);
    prisma.marketPrice.findMany.mockResolvedValue([]);
    const repository = new SnapshotRepository(prisma as never);

    await repository.findSnapshotInput(identity);

    expect(prisma.fill.findMany).toHaveBeenCalledWith({
      where: {
        accountId: { in: ['ACC-1001'] },
        filledAt: { lte: DATASET_NOW },
      },
      select: {
        accountId: true,
        instrumentSymbol: true,
        side: true,
        quantity: true,
        price: true,
        commissionUsd: true,
        filledAt: true,
        sessionDate: true,
      },
      orderBy: { filledAt: 'asc' },
    });
  });
});
