export type FillSide = 'BUY' | 'SELL';

export type SnapshotAccount = {
  id: string;
  balance: number;
};

export type SnapshotFill = {
  accountId: string;
  instrumentSymbol: string;
  side: FillSide;
  quantity: number;
  price: number;
  commissionUsd: number;
  filledAt: Date;
  sessionDate: string;
};

export type SnapshotInstrument = {
  symbol: string;
  pointValueUsd: number;
};

export type SnapshotMarketPrice = {
  symbol: string;
  markPrice: number;
};

export type SnapshotInput = {
  accounts: SnapshotAccount[];
  fills: SnapshotFill[];
  instruments: SnapshotInstrument[];
  marketPrices: SnapshotMarketPrice[];
  currentSessionDate: string;
  asOf: Date;
};

export type SnapshotPosition = {
  instrument: string;
  netQty: number;
  avgPrice: number;
  marketPrice: number;
  unrealizedPnl: number;
};

export type SnapshotResult = {
  accountBalance: number;
  positions: SnapshotPosition[];
  realizedPnl: number;
  unrealizedPnl: number;
  commissions: number;
  dayPnl: number;
  positionsNotional: number;
  riskScore: number;
  asOf: Date;
};
