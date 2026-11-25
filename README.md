# INTERGLOBE — MVP (Phase 2 du cahier des charges)

Plateforme d'investissement participatif dans l'achat, la remise en état et la revente de véhicules.
Base : *Cahier des charges fonctionnel et technique v1.2 (novembre 2026)*.

**Stack** : Next.js 15 (App Router, Server Actions) · TypeScript · PostgreSQL 16 · Prisma 6 · Tailwind CSS 4 · Vitest.

## Démarrage

```bash
cp .env.example .env          # adapter DATABASE_URL / TEST_DATABASE_URL
npm install
npx prisma migrate deploy     # schéma + triggers d'immuabilité
npm run db:seed               # données de démonstration (refusé en production)
npm run dev                   # http://localhost:3000
```

Comptes de démonstration (mot de passe `Demo2026interglobe`) :

| E-mail | Rôle |
|---|---|
| `super@interglobe.test` | Super administrateur |
| `admin@interglobe.test` | Administrateur |
| `finance@interglobe.test`, `finance2@interglobe.test` | Responsables financiers (double approbation) |
| `ama@`, `koffi@`, `awa@interglobe.test` | Investisseurs |

Les données de démo contiennent l'exemple du CDC de bout en bout : opération clôturée, B = 600 000 FCFA, et 540 000 FCFA réclamables par Ama.

## Déploiement de test (Vercel + Supabase)

- **Base** : projet Supabase `interglobe-test` (région Paris, eu-west-3). Le schéma est appliqué, les migrations sont enregistrées dans `_prisma_migrations`, et les données de démo sont chargées.
- **Sécurité Supabase** : l'API REST publique (clé `anon`) n'a accès à aucune table : RLS est activé sans politique et les droits de `anon`/`authenticated` sont retirés. Seul le serveur Next.js y accède, via Prisma.
- **Vercel** : importer le dépôt, framework Next.js, région `cdg1` (fixée dans `vercel.json`). Variables d'environnement :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | Supabase → Connect → *Transaction pooler* (port 6543), en ajoutant `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Supabase → Connect → *Session pooler* (port 5432) |
| `DEV_SHOW_VERIFICATION_CODES` | `true` sur la version test uniquement (aucun e-mail n'est envoyé) |
| `SUPABASE_URL` | `https://pghuascoofqnaqslukec.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → clé secrète (envoi des photos, serveur uniquement) |

Photos : bucket public `vehicle-photos` (5 Mo max, JPEG/PNG/WebP). Les images sont réduites à 1920 px dans le navigateur avant l'envoi ; le serveur vérifie le vrai format du fichier.

Pour une nouvelle migration : `DATABASE_URL=… DIRECT_URL=… npx prisma migrate deploy` depuis un poste qui a accès à Supabase.

## Tests

```bash
npm test               # 44 tests : unitaires + intégration sur PostgreSQL (TEST_DATABASE_URL)
npm run lint           # vérification TypeScript
```

Les tests d'intégration couvrent les critères de recette du §20 : dépôt doublon, double clic, investissements concurrents, plafond, clôture à double approbation, réclamation idempotente, grand livre immuable et équilibré, opération figée après clôture, journal d'audit.

## Ce qui est livré

| CDC | Contenu |
|---|---|
| §2 | Règle de partage `B×E/(E+P)×50 %` dans `src/lib/domain/profit-sharing.ts`. Arrondi : la part de l'entreprise est arrondie à l'inférieur (au profit des particuliers), puis répartie au plus fort reste, si bien que la somme des gains égale exactement l'enveloppe. |
| §2.5 | Règle de perte paramétrable : `UNSET`, `PROPORTIONAL` ou `COMPANY_FIRST_LOSS`. Tant qu'elle vaut `UNSET`, toute clôture déficitaire est **bloquée**. |
| §3 | Rôles et matrice de permissions (`src/lib/auth/permissions.ts`), avec contrôle des quatre yeux sur les dépenses et la clôture. |
| §4 | Site public, catalogue filtrable, fiche véhicule, 15 états d'opération et transitions contrôlées avec historique. |
| §5 | Inscription, vérification par code à usage unique (haché, limité en essais), sessions en base, limitation des tentatives de connexion, historique, « déconnecter toutes les sessions », suspension. |
| §6 | Grand livre en partie double : triggers PostgreSQL qui interdisent UPDATE/DELETE et imposent des transactions équilibrées, clés d'idempotence, verrous de ligne. Rapprochements visibles sur le tableau de bord. |
| §7–8 | Investissement atomique (récapitulatif, acceptation des risques enregistrée avec la version des CG, reçu). Dépenses avec justificatifs, mises à jour publiées, vente, clôture (préparation puis validation par une autre personne), « Mes gains » avec le détail du calcul, réclamation qui passe le capital et le gain ou la perte en écritures distinctes. |
| §12 | Back-office : opérations, dépenses, clôtures, comptes, crédit de dépôt justifié, grand livre, journal d'audit, paramètres, pays. |
| §15–16 | Interface mobile d'abord en français, en-têtes de sécurité, validation serveur de toutes les opérations, mots de passe hachés (bcrypt). |

## Dépôts par agents locaux (CDC §9, §11)

1. L'investisseur choisit son pays, un agent et un moyen de paiement (Flooz, T-Money, MTN MoMo…), voit les coordonnées, les frais, le taux et le montant qui sera crédité.
2. Il paie hors plateforme, puis déclare la référence de transaction (capture facultative, stockée en privé).
3. L'agent (rôle `AGENT`, espace `/agent`) vérifie la réception réelle et confirme ou rejette. Il ne voit que ses propres demandes.
4. Sous le seuil `DEPOSIT_REVIEW_THRESHOLD` (500 000 FCFA par défaut), le portefeuille est crédité immédiatement ; au-delà, un responsable financier valide dans `/admin/depots`.

Contrôles : référence de transaction unique, expiration (`DEPOSIT_EXPIRY_HOURS`, 72 h), litige, crédit idempotent, taux figé à la demande et historisé (jamais modifié). Les montants en attente ne sont pas investissables.
Agents de démonstration : `agent.lome@interglobe.test` (Togo), `agent.cotonou@interglobe.test` (Bénin).

## Choix et limites à connaître

- **Dépôts** : par agents locaux (ci-dessus). Le crédit manuel par un responsable financier reste disponible pour les cas exceptionnels.
- **Retraits** par agents et **commissions** d'agents : pas encore réalisés.
- **E-mail / SMS** : aucun fournisseur n'est branché. Les codes de vérification sont écrits dans la console serveur et, en développement uniquement, affichés à l'écran (`DEV_SHOW_VERIFICATION_CODES`).
- **Photos et justificatifs** : on saisit des URL ou des références. Le stockage objet privé avec liens temporaires (§16) reste à faire.
- **Devise de référence** : XOF (FCFA), montants entiers en `BigInt`. La multi-devise et les taux (§16) relèvent de la phase 3.
- « Financement atteint » déclenché manuellement sous l'objectif : l'entreprise complète le montant manquant, et sa contribution E augmente d'autant (§2.1).
- Annulation possible jusqu'à « Financement atteint » ; elle rembourse automatiquement chaque investisseur.

## Reste à faire

- **Phase 3** : pays et devises avec taux, agents et moyens de paiement, demandes de dépôt et de retrait avec preuves et statuts (§9–11), espace agent, commissions, litiges.
- Réinitialisation du mot de passe par code (modèle déjà prévu), KYC progressif, notifications par e-mail.
- Stockage privé des documents, sauvegardes, supervision, environnement de staging.
- Décisions du §22 encore à trancher par le commanditaire (règle de perte, frais, seuils, KYC, contrats).

## Structure

```
prisma/            schéma, migrations (dont triggers d'immuabilité), seed
src/lib/domain/    règles pures : partage du bénéfice, états d'opération
src/lib/ledger/    grand livre en partie double
src/lib/services/  services métier (transactions SQL, audit, notifications)
src/app/           pages et actions serveur (public, /espace, /admin)
tests/             unitaires et intégration
```
