import { Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/authenticated-identity.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DATASET_CURRENT_SESSION_DATE,
  DATASET_NOW,
} from './snapshot.constants.js';
import type { SnapshotInput } from './snapshot.types.js';

function toNumber(value: { toString(): string }): number {
  return Number(value.toString());
}

function toSessionDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class SnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSnapshotInput(
    identity: AuthenticatedIdentity,
  ): Promise<SnapshotInput | null> {
    const trader = await this.prisma.trader.findFirst({
      where: {
        id: identity.traderId,
        brokerId: identity.brokerId,
      },
      select: { id: true },
    });

    if (!trader) {
      return null;
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        traderId: trader.id,
        status: { in: ['active', 'restricted'] },
      },
      select: {
        id: true,
        balance: true,
      },
    });

    const accountIds = accounts.map((account) => account.id);
    const fills =
      accountIds.length === 0
        ? []
        : await this.prisma.fill.findMany({
            where: {
              accountId: { in: accountIds },
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

    const [instruments, marketPrices] = await Promise.all([
      this.prisma.instrument.findMany({
        select: {
          symbol: true,
          pointValueUsd: true,
        },
      }),
      this.prisma.marketPrice.findMany({
        select: {
          symbol: true,
          markPrice: true,
        },
      }),
    ]);

    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        balance: toNumber(account.balance),
      })),
      fills: fills.map((fill) => ({
        accountId: fill.accountId,
        instrumentSymbol: fill.instrumentSymbol,
        side: fill.side,
        quantity: fill.quantity,
        price: toNumber(fill.price),
        commissionUsd: toNumber(fill.commissionUsd),
        filledAt: fill.filledAt,
        sessionDate: toSessionDate(fill.sessionDate),
      })),
      instruments: instruments.map((instrument) => ({
        symbol: instrument.symbol,
        pointValueUsd: toNumber(instrument.pointValueUsd),
      })),
      marketPrices: marketPrices.map((price) => ({
        symbol: price.symbol,
        markPrice: toNumber(price.markPrice),
      })),
      currentSessionDate: DATASET_CURRENT_SESSION_DATE,
      asOf: DATASET_NOW,
    };
  }
}
