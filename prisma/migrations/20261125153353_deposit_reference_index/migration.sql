-- DropIndex
DROP INDEX "DepositRequest_provider_payerReference_idx";

-- CreateIndex
CREATE INDEX "DepositRequest_payerReference_idx" ON "DepositRequest"("payerReference");
