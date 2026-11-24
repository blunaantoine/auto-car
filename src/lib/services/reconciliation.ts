// Contrôles de rapprochement du grand livre (CDC §12 « Gestion financière »).
import { prisma } from "../db";

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export async function runReconciliation(): Promise<Check[]> {
  const checks: Check[] = [];

  const total = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
  checks.push({ label: "Grand livre équilibré", ok: (total._sum.amount ?? 0n) === 0n, detail: `Somme de toutes les écritures : ${total._sum.amount ?? 0n}` });

  const unbalanced = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "transactionId" AS id FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM(amount) <> 0`;
  checks.push({ label: "Chaque transaction équilibrée", ok: unbalanced.length === 0, detail: `${unbalanced.length} transaction(s) déséquilibrée(s)` });

  const negativeWallets = await prisma.$queryRaw<{ code: string }[]>`
    SELECT a.code FROM "LedgerAccount" a JOIN "LedgerEntry" e ON e."accountId" = a.id
    WHERE a.type = 'USER_WALLET' GROUP BY a.code HAVING SUM(e.amount) < 0`;
  checks.push({ label: "Aucun portefeuille négatif", ok: negativeWallets.length === 0, detail: `${negativeWallets.length} portefeuille(s) négatif(s)` });

  // Pool d'opération = investissements actifs (avant clôture) ou montants non encore réclamés (après).
  const poolMismatch = await prisma.$queryRaw<{ title: string; pool: bigint; expected: bigint }[]>`
    SELECT o.title,
      COALESCE((SELECT SUM(e.amount) FROM "LedgerEntry" e WHERE e."accountId" = a.id), 0)::bigint AS pool,
      (COALESCE((SELECT SUM(i.amount) FROM "Investment" i WHERE i."operationId" = o.id AND i.status = 'ACTIVE'), 0)
      + COALESCE((SELECT SUM(s.claimable) FROM "InvestorSettlement" s JOIN "Investment" i2 ON i2.id = s."investmentId"
                  WHERE i2."operationId" = o.id AND s.status = 'CLAIMABLE'), 0))::bigint AS expected
    FROM "Operation" o JOIN "LedgerAccount" a ON a."operationId" = o.id`;
  const bad = poolMismatch.filter((p) => p.pool !== p.expected);
  checks.push({
    label: "Pools d'opération rapprochés",
    ok: bad.length === 0,
    detail: bad.length ? bad.map((b) => `${b.title} : ${b.pool} ≠ ${b.expected}`).join(" ; ") : `${poolMismatch.length} opération(s) vérifiée(s)`,
  });

  const fundedMismatch = await prisma.$queryRaw<{ title: string }[]>`
    SELECT o.title FROM "Operation" o
    WHERE o."investorFunded" <> COALESCE((SELECT SUM(i.amount) FROM "Investment" i WHERE i."operationId" = o.id AND i.status <> 'REFUNDED'), 0)
      AND o.status <> 'CANCELLED'`;
  checks.push({ label: "Montants financés cohérents", ok: fundedMismatch.length === 0, detail: fundedMismatch.length ? fundedMismatch.map((f) => f.title).join(", ") : "OK" });

  return checks;
}
