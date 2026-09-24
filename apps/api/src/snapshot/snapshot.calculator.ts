import type {
  SnapshotFill,
  SnapshotInput,
  SnapshotPosition,
  SnapshotResult,
} from './snapshot.types.js';

type Inventory = {
  qty: number;
  avgPrice: number;
};

function signedQuantity(fill: SnapshotFill): number {
  return fill.side === 'BUY' ? fill.quantity : -fill.quantity;
}

function inventoryKey(accountId: string, instrumentSymbol: string): string {
  return `${accountId}|${instrumentSymbol}`;
}

function requirePointValue(
  pointValues: Map<string, number>,
  symbol: string,
): number {
  const pointValue = pointValues.get(symbol);
  if (pointValue === undefined) {
    throw new Error(`Missing point value for ${symbol}`);
  }
  return pointValue;
}

function requireMarkPrice(marks: Map<string, number>, symbol: string): number {
  const mark = marks.get(symbol);
  if (mark === undefined) {
    throw new Error(`Missing market price for ${symbol}`);
  }
  return mark;
}

function realizedPnlForClose(
  currentQty: number,
  avgPrice: number,
  closePrice: number,
  closedQty: number,
  pointValueUsd: number,
): number {
  if (currentQty > 0) {
    return (closePrice - avgPrice) * closedQty * pointValueUsd;
  }
  return (avgPrice - closePrice) * closedQty * pointValueUsd;
}

function applyFill(
  current: Inventory,
  fill: SnapshotFill,
  pointValueUsd: number,
): { next: Inventory; realizedPnl: number } {
  const signedQty = signedQuantity(fill);

  if (current.qty === 0) {
    return {
      next: { qty: signedQty, avgPrice: fill.price },
      realizedPnl: 0,
    };
  }

  const sameDirection = Math.sign(current.qty) === Math.sign(signedQty);
  if (sameDirection) {
    const absCurrent = Math.abs(current.qty);
    const nextQty = current.qty + signedQty;
    return {
      next: {
        qty: nextQty,
        avgPrice:
          (absCurrent * current.avgPrice + fill.quantity * fill.price) /
          Math.abs(nextQty),
      },
      realizedPnl: 0,
    };
  }

  const closedQty = Math.min(Math.abs(current.qty), fill.quantity);
  const realizedPnl = realizedPnlForClose(
    current.qty,
    current.avgPrice,
    fill.price,
    closedQty,
    pointValueUsd,
  );

  if (fill.quantity < Math.abs(current.qty)) {
    return {
      next: {
        qty: current.qty + signedQty,
        avgPrice: current.avgPrice,
      },
      realizedPnl,
    };
  }

  if (fill.quantity === Math.abs(current.qty)) {
    return { next: { qty: 0, avgPrice: 0 }, realizedPnl };
  }

  const leftover = fill.quantity - Math.abs(current.qty);
  return {
    next: {
      qty: signedQty > 0 ? leftover : -leftover,
      avgPrice: fill.price,
    },
    realizedPnl,
  };
}

function aggregateOpenPositions(
  openLots: Array<{
    instrument: string;
    qty: number;
    avgPrice: number;
    unrealizedPnl: number;
  }>,
  marks: Map<string, number>,
): SnapshotPosition[] {
  const byInstrument = new Map<
    string,
    Array<(typeof openLots)[number]>
  >();

  for (const lot of openLots) {
    const existing = byInstrument.get(lot.instrument) ?? [];
    existing.push(lot);
    byInstrument.set(lot.instrument, existing);
  }

  return [...byInstrument.entries()]
    .map(([instrument, lots]) => {
      const netQty = lots.reduce((sum, lot) => sum + lot.qty, 0);
      if (netQty === 0) {
        return null;
      }

      const sameDirectionLots = lots.filter(
        (lot) => Math.sign(lot.qty) === Math.sign(netQty),
      );
      const weight = sameDirectionLots.reduce(
        (sum, lot) => sum + Math.abs(lot.qty),
        0,
      );
      // Same-direction accounts: quantity-weighted average.
      // Opposing accounts: display avg uses only the remaining (net) side.
      // Inventory/P&L were already computed per account+instrument.
      const avgPrice =
        sameDirectionLots.reduce(
          (sum, lot) => sum + Math.abs(lot.qty) * lot.avgPrice,
          0,
        ) / weight;

      return {
        instrument,
        netQty,
        avgPrice,
        marketPrice: requireMarkPrice(marks, instrument),
        unrealizedPnl: lots.reduce((sum, lot) => sum + lot.unrealizedPnl, 0),
      };
    })
    .filter((position) => position !== null)
    .sort((a, b) => a.instrument.localeCompare(b.instrument));
}

function calculateRiskScore(
  positionsNotional: number,
  accountBalance: number,
): number {
  if (accountBalance <= 0) {
    return positionsNotional > 0 ? 100 : 0;
  }

  return Math.min(100, Math.max(0, (positionsNotional / accountBalance) * 100));
}

export class SnapshotCalculator {
  calculate(input: SnapshotInput): SnapshotResult {
    const pointValues = new Map(
      input.instruments.map((instrument) => [
        instrument.symbol,
        instrument.pointValueUsd,
      ]),
    );
    const marks = new Map(
      input.marketPrices.map((price) => [price.symbol, price.markPrice]),
    );
    const includedAccountIds = new Set(input.accounts.map((account) => account.id));

    const inventory = new Map<string, Inventory>();
    let realizedPnl = 0;
    let commissions = 0;

    const fills = input.fills
      .filter((fill) => includedAccountIds.has(fill.accountId))
      .slice()
      .sort((a, b) => a.filledAt.getTime() - b.filledAt.getTime());

    for (const fill of fills) {
      if (fill.quantity <= 0) {
        throw new Error(`Fill quantity must be positive`);
      }

      const pointValueUsd = requirePointValue(pointValues, fill.instrumentSymbol);
      const key = inventoryKey(fill.accountId, fill.instrumentSymbol);
      const current = inventory.get(key) ?? { qty: 0, avgPrice: 0 };
      const { next, realizedPnl: fillRealized } = applyFill(
        current,
        fill,
        pointValueUsd,
      );
      inventory.set(key, next);

      if (fill.sessionDate === input.currentSessionDate) {
        realizedPnl += fillRealized;
        commissions += fill.commissionUsd;
      }
    }

    const openLots: Array<{
      instrument: string;
      qty: number;
      avgPrice: number;
      unrealizedPnl: number;
    }> = [];

    for (const [key, position] of inventory) {
      if (position.qty === 0) {
        continue;
      }
      const instrument = key.slice(key.indexOf('|') + 1);
      const pointValueUsd = requirePointValue(pointValues, instrument);
      const marketPrice = requireMarkPrice(marks, instrument);
      openLots.push({
        instrument,
        qty: position.qty,
        avgPrice: position.avgPrice,
        unrealizedPnl:
          position.qty * (marketPrice - position.avgPrice) * pointValueUsd,
      });
    }

    const positions = aggregateOpenPositions(openLots, marks);
    const unrealizedPnl = positions.reduce(
      (sum, position) => sum + position.unrealizedPnl,
      0,
    );
    const accountBalance = input.accounts.reduce(
      (sum, account) => sum + account.balance,
      0,
    );
    const positionsNotional = positions.reduce((sum, position) => {
      const pointValueUsd = requirePointValue(pointValues, position.instrument);
      return (
        sum + Math.abs(position.netQty) * position.marketPrice * pointValueUsd
      );
    }, 0);

    // Assessment-level day P&L: session realized + current unrealized - session commissions.
    // A production ledger would use session/opening-equity semantics for overnight inventory.
    const dayPnl = realizedPnl + unrealizedPnl - commissions;

    return {
      accountBalance,
      positions,
      realizedPnl,
      unrealizedPnl,
      commissions,
      dayPnl,
      positionsNotional,
      riskScore: calculateRiskScore(positionsNotional, accountBalance),
      asOf: input.asOf,
    };
  }
}
