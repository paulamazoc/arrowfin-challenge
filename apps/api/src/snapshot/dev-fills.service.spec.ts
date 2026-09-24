import { NotFoundException } from '@nestjs/common';
import { DevFillsService } from './dev-fills.service.js';

const identity = { traderId: 'T-001', brokerId: 'BRK-ARWP' };
const body = {
  accountId: 'ACC-1006',
  instrumentSymbol: 'MES',
  side: 'BUY',
  quantity: 1,
  price: 5642.25,
  commissionUsd: 0.7,
};

describe('DevFillsService', () => {
  it('rejects an account that is not owned by the authenticated tenant', async () => {
    const prisma = {
      trader: { findFirst: vi.fn().mockResolvedValue({ id: 'T-001' }) },
      account: { findFirst: vi.fn().mockResolvedValue(null) },
      instrument: { findUnique: vi.fn() },
      fill: { create: vi.fn() },
    };
    const gateway = { emitSnapshotUpdated: vi.fn() };
    const service = new DevFillsService(prisma as never, gateway as never);

    await expect(service.inject(identity, body)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'ACC-1006',
        traderId: 'T-001',
        status: { in: ['active', 'restricted'] },
      },
      select: { id: true },
    });
    expect(prisma.fill.create).not.toHaveBeenCalled();
    expect(gateway.emitSnapshotUpdated).not.toHaveBeenCalled();
  });
});
