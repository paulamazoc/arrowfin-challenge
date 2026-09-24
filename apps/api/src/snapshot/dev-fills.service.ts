import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedIdentity } from '../auth/authenticated-identity.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DATASET_CURRENT_SESSION_DATE,
  DATASET_NOW,
} from './snapshot.constants.js';
import { SnapshotGateway } from './snapshot.gateway.js';

export type DevFillBody = {
  accountId: string;
  instrumentSymbol: string;
  side: string;
  quantity: number;
  price: number;
  commissionUsd: number;
};

@Injectable()
export class DevFillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SnapshotGateway,
  ) {}

  async inject(
    identity: AuthenticatedIdentity,
    body: DevFillBody,
  ): Promise<{ id: string }> {
    if (body.side !== 'BUY' && body.side !== 'SELL') {
      throw new BadRequestException('side must be BUY or SELL');
    }
    if (!Number.isInteger(body.quantity) || body.quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    if (typeof body.price !== 'number' || !(body.price > 0)) {
      throw new BadRequestException('price must be a positive number');
    }
    if (typeof body.commissionUsd !== 'number' || body.commissionUsd < 0) {
      throw new BadRequestException('commissionUsd must be >= 0');
    }

    const trader = await this.prisma.trader.findFirst({
      where: { id: identity.traderId, brokerId: identity.brokerId },
      select: { id: true },
    });
    if (!trader) {
      throw new NotFoundException();
    }

    const account = await this.prisma.account.findFirst({
      where: {
        id: body.accountId,
        traderId: trader.id,
        status: { in: ['active', 'restricted'] },
      },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException();
    }

    const instrument = await this.prisma.instrument.findUnique({
      where: { symbol: body.instrumentSymbol },
      select: { symbol: true },
    });
    if (!instrument) {
      throw new BadRequestException('Unknown instrument');
    }

    const created = await this.prisma.fill.create({
      data: {
        id: `FIL-DEV-${randomUUID().slice(0, 8)}`,
        accountId: account.id,
        instrumentSymbol: instrument.symbol,
        side: body.side,
        quantity: body.quantity,
        price: body.price,
        commissionUsd: body.commissionUsd,
        filledAt: DATASET_NOW,
        orderId: `ORD-DEV-${randomUUID().slice(0, 8)}`,
        sessionDate: new Date(`${DATASET_CURRENT_SESSION_DATE}T00:00:00.000Z`),
      },
      select: { id: true },
    });

    this.gateway.emitSnapshotUpdated(identity);
    return created;
  }
}
