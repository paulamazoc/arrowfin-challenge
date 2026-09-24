'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL, DEMO_IDENTITY } from '../lib/demo-identity';
import { fetchSnapshot, money, price, qty, riskPct } from '../lib/snapshot';

type ConnectionState = 'live' | 'reconnecting' | 'disconnected';

function pnlClass(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-zinc-300';
}

export function SnapshotDashboard() {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>('disconnected');
  const snapshotQuery = useQuery({
    queryKey: ['snapshot'],
    queryFn: fetchSnapshot,
  });

  useEffect(() => {
    const socket = io(API_BASE_URL, {
      auth: {
        traderId: DEMO_IDENTITY.traderId,
        brokerId: DEMO_IDENTITY.brokerId,
      },
    });

    socket.on('connect', () => {
      setConnection('live');
      void queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    });
    socket.io.on('reconnect_attempt', () => {
      setConnection('reconnecting');
    });
    socket.on('disconnect', () => {
      setConnection('disconnected');
    });
    socket.on('snapshot.updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    });

    return () => {
      socket.close();
    };
  }, [queryClient]);

  const snapshot = snapshotQuery.data;
  const highRisk = (snapshot?.riskScore ?? 0) > 75;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Trader Daily Snapshot
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            As of{' '}
            {snapshot
              ? new Date(snapshot.asOf).toISOString().replace('.000Z', 'Z')
              : '—'}
          </p>
        </div>
        <ConnectionBadge state={connection} />
      </header>

      {snapshotQuery.isLoading ? <LoadingState /> : null}

      {snapshotQuery.isError ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-4">
          <p className="text-sm text-red-200">Unable to load snapshot.</p>
          <button
            type="button"
            className="mt-3 rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900"
            onClick={() => void snapshotQuery.refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {snapshot ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Day P&L" value={money(snapshot.dayPnl)} tone={pnlClass(snapshot.dayPnl)} />
            <SummaryCard
              label="Account Balance"
              value={money(snapshot.accountBalance)}
            />
            <RiskCard score={snapshot.riskScore} high={highRisk} />
          </section>

          <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
                Open Positions
              </h2>
            </div>
            {snapshot.positions.length === 0 ? (
              <p className="px-4 py-8 text-sm text-zinc-400">
                No open positions.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-950/60 text-zinc-400">
                    <tr>
                      <th className="px-4 py-2 font-medium">Instrument</th>
                      <th className="px-4 py-2 font-medium">Net Qty</th>
                      <th className="px-4 py-2 font-medium">Avg Price</th>
                      <th className="px-4 py-2 font-medium">Mark</th>
                      <th className="px-4 py-2 font-medium">Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.positions.map((position) => (
                      <tr
                        key={position.instrument}
                        className="border-t border-zinc-800"
                      >
                        <td className="px-4 py-3 font-medium text-zinc-100">
                          {position.instrument}
                        </td>
                        <td className="px-4 py-3 text-zinc-200">
                          {qty(position.netQty)}
                        </td>
                        <td className="px-4 py-3 text-zinc-200">
                          {price(position.avgPrice)}
                        </td>
                        <td className="px-4 py-3 text-zinc-200">
                          {price(position.marketPrice)}
                        </td>
                        <td
                          className={`px-4 py-3 font-medium ${pnlClass(position.unrealizedPnl)}`}
                        >
                          {money(position.unrealizedPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const label =
    state === 'live'
      ? 'Live'
      : state === 'reconnecting'
        ? 'Reconnecting'
        : 'Disconnected';
  const color =
    state === 'live'
      ? 'bg-emerald-400'
      : state === 'reconnecting'
        ? 'bg-amber-400'
        : 'bg-zinc-500';

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-200"
      aria-live="polite"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'text-zinc-50',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function RiskCard({ score, high }: { score: number; high: boolean }) {
  return (
    <div
      className={
        high
          ? 'rounded-lg border-2 border-red-500 bg-red-950 p-4'
          : 'rounded-lg border border-zinc-800 bg-zinc-900 p-4'
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        Risk
      </p>
      {high ? (
        <p className="mt-2 text-sm font-bold tracking-wide text-red-200">
          HIGH RISK
        </p>
      ) : null}
      <p
        className={
          high
            ? 'mt-1 text-3xl font-bold text-red-100'
            : 'mt-2 text-2xl font-semibold text-zinc-50'
        }
      >
        {riskPct(score)}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-busy="true">
      <div className="h-24 animate-pulse rounded-lg bg-zinc-800" />
      <div className="h-24 animate-pulse rounded-lg bg-zinc-800" />
      <div className="h-24 animate-pulse rounded-lg bg-zinc-800" />
    </div>
  );
}
