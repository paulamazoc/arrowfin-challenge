import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { deriveSessionDate } from './cme-session.ts';

// Dataset cut. Do not substitute the machine clock.
const DATASET_NOW = new Date('2026-08-25T14:30:00Z');

const prisma = new PrismaClient();

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== '')) {
      rows.push(row);
    }
  }

  const [header, ...body] = rows;
  if (!header) {
    return [];
  }

  return body.map((values) => {
    const record: CsvRow = {};
    header.forEach((key, index) => {
      record[key] = values[index] ?? '';
    });
    return record;
  });
}

function readDatasetCsv(datasetDir: string, filename: string): CsvRow[] {
  const filePath = path.join(datasetDir, filename);
  return parseCsv(readFileSync(filePath, 'utf8'));
}

function required(row: CsvRow, column: string, file: string): string {
  const value = row[column]?.trim();
  if (!value) {
    throw new Error(`${file}: missing required column ${column}`);
  }
  return value;
}

function parseAccountStatus(value: string): 'active' | 'restricted' | 'closed' {
  if (value === 'active' || value === 'restricted' || value === 'closed') {
    return value;
  }
  throw new Error(`accounts.csv: unsupported status ${value}`);
}

function parseFillSide(value: string): 'BUY' | 'SELL' {
  if (value === 'BUY' || value === 'SELL') {
    return value;
  }
  throw new Error(`fills.csv: unsupported side ${value}`);
}

function parseQuantity(value: string): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`fills.csv: invalid quantity`);
  }
  return quantity;
}

async function main() {
  const datasetDir = path.resolve(import.meta.dirname, '../../../dataset');

  const brokerRows = readDatasetCsv(datasetDir, 'brokers.csv');
  const traderRows = readDatasetCsv(datasetDir, 'traders.csv');
  const accountRows = readDatasetCsv(datasetDir, 'accounts.csv');
  const instrumentRows = readDatasetCsv(datasetDir, 'instruments.csv');
  const marketPriceRows = readDatasetCsv(datasetDir, 'market_prices.csv');
  const fillRows = readDatasetCsv(datasetDir, 'fills.csv');

  const brokers = brokerRows.map((row) => ({
    id: required(row, 'id', 'brokers.csv'),
    name: required(row, 'name', 'brokers.csv'),
  }));

  // Intentionally map only tenant identity fields. Do not persist trader PII.
  const traders = traderRows.map((row) => ({
    id: required(row, 'id', 'traders.csv'),
    brokerId: required(row, 'broker_id', 'traders.csv'),
  }));

  const accounts = accountRows.map((row) => ({
    id: required(row, 'id', 'accounts.csv'),
    traderId: required(row, 'trader_id', 'accounts.csv'),
    balance: new Prisma.Decimal(required(row, 'balance', 'accounts.csv')),
    status: parseAccountStatus(required(row, 'status', 'accounts.csv')),
  }));

  const instruments = instrumentRows.map((row) => ({
    symbol: required(row, 'symbol', 'instruments.csv'),
    pointValueUsd: new Prisma.Decimal(
      required(row, 'point_value_usd', 'instruments.csv'),
    ),
  }));

  const marketPrices = marketPriceRows.map((row) => ({
    symbol: required(row, 'symbol', 'market_prices.csv'),
    markPrice: new Prisma.Decimal(required(row, 'mark_price', 'market_prices.csv')),
    asOf: new Date(required(row, 'as_of', 'market_prices.csv')),
  }));

  const fills = fillRows.map((row) => {
    const filledAt = new Date(required(row, 'filled_at', 'fills.csv'));
    if (Number.isNaN(filledAt.getTime())) {
      throw new Error('fills.csv: invalid filled_at');
    }
    if (filledAt.getTime() > DATASET_NOW.getTime()) {
      throw new Error('fills.csv: filled_at is after dataset now');
    }

    return {
      id: required(row, 'id', 'fills.csv'),
      accountId: required(row, 'account_id', 'fills.csv'),
      instrumentSymbol: required(row, 'instrument_symbol', 'fills.csv'),
      side: parseFillSide(required(row, 'side', 'fills.csv')),
      quantity: parseQuantity(required(row, 'quantity', 'fills.csv')),
      price: new Prisma.Decimal(required(row, 'price', 'fills.csv')),
      commissionUsd: new Prisma.Decimal(
        required(row, 'commission_usd', 'fills.csv'),
      ),
      filledAt,
      orderId: required(row, 'order_id', 'fills.csv'),
      sessionDate: deriveSessionDate(filledAt),
    };
  });

  const brokerIds = new Set(brokers.map((broker) => broker.id));
  const traderIds = new Set(traders.map((trader) => trader.id));
  const accountIds = new Set(accounts.map((account) => account.id));
  const instrumentSymbols = new Set(
    instruments.map((instrument) => instrument.symbol),
  );

  for (const trader of traders) {
    if (!brokerIds.has(trader.brokerId)) {
      throw new Error(`traders.csv: unknown broker_id for ${trader.id}`);
    }
  }
  for (const account of accounts) {
    if (!traderIds.has(account.traderId)) {
      throw new Error(`accounts.csv: unknown trader_id for ${account.id}`);
    }
  }
  for (const price of marketPrices) {
    if (!instrumentSymbols.has(price.symbol)) {
      throw new Error(`market_prices.csv: unknown symbol ${price.symbol}`);
    }
  }
  for (const fill of fills) {
    if (!accountIds.has(fill.accountId)) {
      throw new Error(`fills.csv: unknown account_id for ${fill.id}`);
    }
    if (!instrumentSymbols.has(fill.instrumentSymbol)) {
      throw new Error(`fills.csv: unknown instrument_symbol for ${fill.id}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.fill.deleteMany();
    await tx.account.deleteMany();
    await tx.trader.deleteMany();
    await tx.marketPrice.deleteMany();
    await tx.instrument.deleteMany();
    await tx.broker.deleteMany();

    await tx.broker.createMany({ data: brokers });
    await tx.instrument.createMany({ data: instruments });
    await tx.marketPrice.createMany({ data: marketPrices });
    await tx.trader.createMany({ data: traders });
    await tx.account.createMany({ data: accounts });
    await tx.fill.createMany({ data: fills });
  });

  const [brokerCount, traderCount, accountCount, instrumentCount, priceCount, fillCount] =
    await Promise.all([
      prisma.broker.count(),
      prisma.trader.count(),
      prisma.account.count(),
      prisma.instrument.count(),
      prisma.marketPrice.count(),
      prisma.fill.count(),
    ]);

  const sessionGroups = await prisma.fill.groupBy({
    by: ['sessionDate'],
    _count: { id: true },
    orderBy: { sessionDate: 'asc' },
  });

  console.log('Seed complete');
  console.log(
    JSON.stringify(
      {
        datasetNow: DATASET_NOW.toISOString(),
        brokers: brokerCount,
        traders: traderCount,
        accounts: accountCount,
        instruments: instrumentCount,
        marketPrices: priceCount,
        fills: fillCount,
        fillsBySessionDate: sessionGroups.map((group) => ({
          sessionDate: group.sessionDate.toISOString().slice(0, 10),
          count: group._count.id,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Seed failed';
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
