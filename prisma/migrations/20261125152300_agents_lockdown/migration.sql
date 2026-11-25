-- Nouvelles tables : même verrouillage que le reste (API publique Supabase fermée).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Agent', 'AgentPaymentMethod', 'ExchangeRate', 'DepositRequest'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interglobe_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO interglobe_app', t);
    END IF;
  END LOOP;
END $$;

-- Les taux appliqués sont historisés : on ajoute un nouveau taux, on ne modifie jamais l'ancien (CDC §16).
CREATE TRIGGER exchange_rate_immutable BEFORE UPDATE OR DELETE ON "ExchangeRate"
  FOR EACH ROW EXECUTE FUNCTION interglobe_forbid_mutation();

ALTER TABLE "DepositRequest" ADD CONSTRAINT deposit_amounts_positive
  CHECK ("amountLocal" > 0 AND "feeLocal" >= 0 AND "amountCredited" > 0 AND rate > 0);
ALTER TABLE "AgentPaymentMethod" ADD CONSTRAINT method_amounts_valid
  CHECK ("minAmount" > 0 AND ("maxAmount" IS NULL OR "maxAmount" >= "minAmount") AND "feeFixed" >= 0 AND "feeBps" >= 0 AND "feeBps" < 10000);
