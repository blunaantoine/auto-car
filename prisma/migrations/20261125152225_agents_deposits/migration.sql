-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNAVAILABLE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('AWAITING_AGENT', 'CONFIRMED_BY_AGENT', 'CREDITED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'DISPUTED');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zone" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "canDeposit" BOOLEAN NOT NULL DEFAULT true,
    "canWithdraw" BOOLEAN NOT NULL DEFAULT false,
    "hours" TEXT,
    "instructions" TEXT,
    "supportContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPaymentMethod" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "minAmount" BIGINT NOT NULL,
    "maxAmount" BIGINT,
    "feeFixed" BIGINT NOT NULL DEFAULT 0,
    "feeBps" INTEGER NOT NULL DEFAULT 0,
    "delay" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rateToRef" DECIMAL(20,8) NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountLocal" BIGINT NOT NULL,
    "feeLocal" BIGINT NOT NULL,
    "rate" DECIMAL(20,8) NOT NULL,
    "rateSource" TEXT NOT NULL,
    "amountCredited" BIGINT NOT NULL,
    "payerReference" TEXT NOT NULL,
    "payerAccount" TEXT,
    "proofPath" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'AWAITING_AGENT',
    "agentReference" TEXT,
    "agentNote" TEXT,
    "rejectReason" TEXT,
    "reviewNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "creditedAt" TIMESTAMP(3),
    "creditedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ledgerTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_userId_key" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "Agent_countryCode_status_idx" ON "Agent"("countryCode", "status");

-- CreateIndex
CREATE INDEX "AgentPaymentMethod_agentId_idx" ON "AgentPaymentMethod"("agentId");

-- CreateIndex
CREATE INDEX "ExchangeRate_currency_effectiveAt_idx" ON "ExchangeRate"("currency", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_reference_key" ON "DepositRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_ledgerTransactionId_key" ON "DepositRequest"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "DepositRequest_agentId_status_idx" ON "DepositRequest"("agentId", "status");

-- CreateIndex
CREATE INDEX "DepositRequest_userId_idx" ON "DepositRequest"("userId");

-- CreateIndex
CREATE INDEX "DepositRequest_provider_payerReference_idx" ON "DepositRequest"("provider", "payerReference");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPaymentMethod" ADD CONSTRAINT "AgentPaymentMethod_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "AgentPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
