-- Verrouillage pour Supabase : l'application accède à la base uniquement côté serveur (Prisma).
-- RLS activé sans politique sur toutes les tables : l'API REST publique (rôles anon/authenticated)
-- ne peut rien lire ni écrire. Le propriétaire des tables (utilisé par Prisma) n'est pas concerné.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;

-- Fonctions des triggers : search_path figé (recommandation de sécurité Supabase)
ALTER FUNCTION interglobe_forbid_mutation() SET search_path = public;
ALTER FUNCTION interglobe_check_balanced() SET search_path = public;
