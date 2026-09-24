-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'restricted', 'closed');

-- CreateEnum
CREATE TYPE "FillSide" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trader" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,

    CONSTRAINT "Trader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL,
    "status" "AccountStatus" NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "symbol" TEXT NOT NULL,
    "pointValueUsd" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "symbol" TEXT NOT NULL,
    "markPrice" DECIMAL(18,8) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentSymbol" TEXT NOT NULL,
    "side" "FillSide" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,8) NOT NULL,
    "commissionUsd" DECIMAL(18,4) NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trader_brokerId_id_idx" ON "Trader"("brokerId", "id");

-- CreateIndex
CREATE INDEX "Account_traderId_status_idx" ON "Account"("traderId", "status");

-- CreateIndex
CREATE INDEX "Fill_accountId_filledAt_idx" ON "Fill"("accountId", "filledAt");

-- CreateIndex
CREATE INDEX "Fill_accountId_sessionDate_idx" ON "Fill"("accountId", "sessionDate");

-- AddForeignKey
ALTER TABLE "Trader" ADD CONSTRAINT "Trader_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "Instrument"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_instrumentSymbol_fkey" FOREIGN KEY ("instrumentSymbol") REFERENCES "Instrument"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;
