import { API_BASE_URL, DEMO_IDENTITY } from './demo-identity';

export type SnapshotPosition = {
  instrument: string;
  netQty: number;
  avgPrice: number;
  marketPrice: number;
  unrealizedPnl: number;
};

export type Snapshot = {
  accountBalance: number;
  positions: SnapshotPosition[];
  realizedPnl: number;
  unrealizedPnl: number;
  commissions: number;
  dayPnl: number;
  positionsNotional: number;
  riskScore: number;
  asOf: string;
};

export async function fetchSnapshot(): Promise<Snapshot> {
  const response = await fetch(`${API_BASE_URL}/snapshot`, {
    headers: {
      'x-trader-id': DEMO_IDENTITY.traderId,
      'x-broker-id': DEMO_IDENTITY.brokerId,
    },
  });
  if (!response.ok) {
    throw new Error('Unable to load snapshot');
  }
  return response.json() as Promise<Snapshot>;
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.round(value * 100) / 100);
}

export function price(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  }).format(value);
}

export function qty(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

export function riskPct(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}
