import { SnapshotCalculator } from './snapshot.calculator.js';
import type {
  SnapshotAccount,
  SnapshotFill,
  SnapshotInput,
  SnapshotInstrument,
  SnapshotMarketPrice,
} from './snapshot.types.js';

const asOf = new Date('2026-08-25T14:30:00Z');
const today = '2026-08-24';
const priorSession = '2026-08-23';

const calculator = new SnapshotCalculator();

function account(
  id = 'ACC-1',
  balance = 10_000,
): SnapshotAccount {
  return { id, balance };
}

function instrument(
  symbol: string,
  pointValueUsd: number,
): SnapshotInstrument {
  return { symbol, pointValueUsd };
}

function mark(symbol: string, markPrice: number): SnapshotMarketPrice {
  return { symbol, markPrice };
}

function fill(
  overrides: Partial<SnapshotFill> &
    Pick<SnapshotFill, 'side' | 'quantity' | 'price'>,
): SnapshotFill {
  return {
    accountId: 'ACC-1',
    instrumentSymbol: 'MES',
    commissionUsd: 0,
    filledAt: new Date('2026-08-25T13:00:00Z'),
    sessionDate: today,
    ...overrides,
  };
}

function input(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    accounts: [account()],
    fills: [],
    instruments: [instrument('MES', 5), instrument('ES', 50)],
    marketPrices: [mark('MES', 100), mark('ES', 100)],
    currentSessionDate: today,
    asOf,
    ...overrides,
  };
}

describe('SnapshotCalculator', () => {
  it('opens a long position on BUY', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [fill({ side: 'BUY', quantity: 2, price: 100 })],
      }),
    );

    expect(snapshot.positions).toEqual([
      {
        instrument: 'MES',
        netQty: 2,
        avgPrice: 100,
        marketPrice: 100,
        unrealizedPnl: 0,
      },
    ]);
    expect(snapshot.realizedPnl).toBe(0);
  });

  it('realizes long P&L when BUY is followed by SELL', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [
          fill({
            side: 'BUY',
            quantity: 2,
            price: 100,
            filledAt: new Date('2026-08-25T13:00:00Z'),
          }),
          fill({
            side: 'SELL',
            quantity: 2,
            price: 110,
            filledAt: new Date('2026-08-25T13:05:00Z'),
          }),
        ],
      }),
    );

    // (110 - 100) * 2 * 5 = 100
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.realizedPnl).toBe(100);
    expect(snapshot.unrealizedPnl).toBe(0);
    expect(snapshot.dayPnl).toBe(100);
  });

  it('opens a short on SELL and realizes short P&L on BUY', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [
          fill({
            side: 'SELL',
            quantity: 2,
            price: 100,
            filledAt: new Date('2026-08-25T13:00:00Z'),
          }),
          fill({
            side: 'BUY',
            quantity: 2,
            price: 90,
            filledAt: new Date('2026-08-25T13:05:00Z'),
          }),
        ],
      }),
    );

    // (100 - 90) * 2 * 5 = 100
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.realizedPnl).toBe(100);
  });

  it('uses running weighted-average price for same-direction fills', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [
          fill({
            side: 'BUY',
            quantity: 2,
            price: 100,
            filledAt: new Date('2026-08-25T13:00:00Z'),
          }),
          fill({
            side: 'BUY',
            quantity: 2,
            price: 120,
            filledAt: new Date('2026-08-25T13:05:00Z'),
          }),
        ],
        marketPrices: [mark('MES', 120)],
      }),
    );

    expect(snapshot.positions[0]?.netQty).toBe(4);
    expect(snapshot.positions[0]?.avgPrice).toBe(110);
    // 4 * (120 - 110) * 5 = 200
    expect(snapshot.unrealizedPnl).toBe(200);
  });

  it('flips a long position short and realizes the closed quantity', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [
          fill({
            side: 'BUY',
            quantity: 2,
            price: 100,
            filledAt: new Date('2026-08-25T13:00:00Z'),
          }),
          fill({
            side: 'SELL',
            quantity: 5,
            price: 110,
            filledAt: new Date('2026-08-25T13:05:00Z'),
          }),
        ],
        marketPrices: [mark('MES', 110)],
      }),
    );

    // Close 2 long: (110 - 100) * 2 * 5 = 100. Remainder short 3 @ 110.
    expect(snapshot.realizedPnl).toBe(100);
    expect(snapshot.positions).toEqual([
      {
        instrument: 'MES',
        netQty: -3,
        avgPrice: 110,
        marketPrice: 110,
        unrealizedPnl: 0,
      },
    ]);
  });

  it('computes unrealized P&L from mark and point value', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [fill({ side: 'BUY', quantity: 1, price: 100 })],
        marketPrices: [mark('MES', 110)],
      }),
    );

    // 1 * (110 - 100) * 5 = 50
    expect(snapshot.positions[0]?.unrealizedPnl).toBe(50);
    expect(snapshot.unrealizedPnl).toBe(50);
  });

  it('scales money by instrument point value', () => {
    const mes = calculator.calculate(
      input({
        fills: [fill({ side: 'BUY', quantity: 1, price: 100 })],
        marketPrices: [mark('MES', 110)],
      }),
    );
    const es = calculator.calculate(
      input({
        fills: [
          fill({
            side: 'BUY',
            quantity: 1,
            price: 100,
            instrumentSymbol: 'ES',
          }),
        ],
        marketPrices: [mark('ES', 110)],
      }),
    );

    expect(mes.unrealizedPnl).toBe(50);
    expect(es.unrealizedPnl).toBe(500);
    expect(es.positionsNotional).toBe(1 * 110 * 50);
    expect(mes.positionsNotional).toBe(1 * 110 * 5);
  });

  it('deducts current-session commissions from day P&L', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [
          fill({
            side: 'BUY',
            quantity: 2,
            price: 100,
            commissionUsd: 1.4,
            filledAt: new Date('2026-08-25T13:00:00Z'),
          }),
          fill({
            side: 'SELL',
            quantity: 2,
            price: 110,
            commissionUsd: 1.4,
            filledAt: new Date('2026-08-25T13:05:00Z'),
          }),
        ],
      }),
    );

    expect(snapshot.realizedPnl).toBe(100);
    expect(snapshot.commissions).toBe(2.8);
    expect(snapshot.dayPnl).toBe(97.2);
  });

  it('assigns risk 100 when balance is zero and exposure is open', () => {
    const snapshot = calculator.calculate(
      input({
        accounts: [account('ACC-1', 0)],
        fills: [fill({ side: 'BUY', quantity: 2, price: 100 })],
      }),
    );

    expect(snapshot.accountBalance).toBe(0);
    expect(snapshot.positionsNotional).toBeGreaterThan(0);
    expect(snapshot.riskScore).toBe(100);
  });

  it('returns empty positions and risk 0 when the trader has no fills', () => {
    const snapshot = calculator.calculate(
      input({
        accounts: [account('ACC-1', 25_000)],
        fills: [],
      }),
    );

    expect(snapshot.positions).toEqual([]);
    expect(snapshot.realizedPnl).toBe(0);
    expect(snapshot.unrealizedPnl).toBe(0);
    expect(snapshot.commissions).toBe(0);
    expect(snapshot.dayPnl).toBe(0);
    expect(snapshot.positionsNotional).toBe(0);
    expect(snapshot.riskScore).toBe(0);
  });

  it('aggregates same-direction account positions by weighted average', () => {
    const snapshot = calculator.calculate(
      input({
        accounts: [account('ACC-1', 5_000), account('ACC-2', 5_000)],
        fills: [
          fill({
            accountId: 'ACC-1',
            side: 'BUY',
            quantity: 2,
            price: 100,
          }),
          fill({
            accountId: 'ACC-2',
            side: 'BUY',
            quantity: 2,
            price: 120,
            filledAt: new Date('2026-08-25T13:01:00Z'),
          }),
        ],
        marketPrices: [mark('MES', 120)],
      }),
    );

    expect(snapshot.positions).toHaveLength(1);
    expect(snapshot.positions[0]?.netQty).toBe(4);
    expect(snapshot.positions[0]?.avgPrice).toBe(110);
    expect(snapshot.accountBalance).toBe(10_000);
  });

  it('keeps prior-session realized P&L out of the day total', () => {
    const snapshot = calculator.calculate(
      input({
        fills: [
          fill({
            side: 'BUY',
            quantity: 2,
            price: 100,
            sessionDate: priorSession,
            filledAt: new Date('2026-08-24T13:00:00Z'),
          }),
          fill({
            side: 'SELL',
            quantity: 2,
            price: 110,
            sessionDate: priorSession,
            filledAt: new Date('2026-08-24T14:00:00Z'),
          }),
        ],
      }),
    );

    expect(snapshot.realizedPnl).toBe(0);
    expect(snapshot.commissions).toBe(0);
    expect(snapshot.dayPnl).toBe(0);
    expect(snapshot.positions).toEqual([]);
  });
});
