-- Grand livre et journal d'audit immuables (CDC §6.2 et §12) :
-- aucune modification ni suppression n'est possible au niveau de la base.
CREATE OR REPLACE FUNCTION interglobe_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % immuable : % interdit (utiliser une écriture inverse)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION interglobe_forbid_mutation();
CREATE TRIGGER ledger_transaction_immutable BEFORE UPDATE OR DELETE ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION interglobe_forbid_mutation();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION interglobe_forbid_mutation();

-- Chaque transaction doit être équilibrée (somme des écritures = 0) et compter
-- au moins deux écritures. Vérifié en fin de transaction SQL (contrainte différée).
CREATE OR REPLACE FUNCTION interglobe_check_balanced() RETURNS trigger AS $$
DECLARE
  total NUMERIC;
  n INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO total, n
    FROM "LedgerEntry" WHERE "transactionId" = NEW."transactionId";
  IF total <> 0 OR n < 2 THEN
    RAISE EXCEPTION 'Transaction % déséquilibrée (somme=%, écritures=%)', NEW."transactionId", total, n;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION interglobe_check_balanced();

-- Montants positifs là où le métier l'exige
ALTER TABLE "Investment" ADD CONSTRAINT investment_amount_positive CHECK (amount > 0);
ALTER TABLE "OperationExpense" ADD CONSTRAINT expense_amount_positive CHECK (amount > 0);
ALTER TABLE "Operation" ADD CONSTRAINT operation_funded_within_target CHECK ("investorFunded" >= 0 AND "investorFunded" <= "investorTarget");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_entry_nonzero CHECK (amount <> 0);
