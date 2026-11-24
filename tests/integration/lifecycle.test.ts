// Recette des règles incontournables (CDC §18 et §20) sur une vraie base PostgreSQL.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { invest } from "@/lib/services/investment";
import {
  addExpense,
  cancelOperation,
  declareSale,
  reviewExpense,
  transitionOperation,
} from "@/lib/services/operations";
import { claimSettlement, prepareClosure, validateClosure } from "@/lib/services/closure";
import { creditDeposit } from "@/lib/services/wallet";
import { updateSetting } from "@/lib/services/settings";
import type { Actor } from "@/lib/services/types";
import { fund, key, makeUser, openOperation, resetDb, walletBalance } from "./helpers";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
};

let admin: Actor, finance: Actor, finance2: Actor, superAdmin: Actor;

beforeEach(async () => {
  await resetDb();
  admin = await makeUser("ADMIN");
  finance = await makeUser("FINANCE");
  finance2 = await makeUser("FINANCE");
  superAdmin = await makeUser("SUPER_ADMIN");
});

async function sellAndClose(opId: string, salePrice: bigint, costs: bigint[]) {
  for (const s of ["ACQUISITION", "REPAIR", "READY_FOR_SALE", "ON_SALE"] as const) await transitionOperation(admin, opId, s);
  for (const amount of costs) {
    const e = await addExpense(admin, opId, { category: "PARTS", label: "Coût", amount, incurredAt: new Date() });
    await reviewExpense(finance, e.id, "APPROVED");
  }
  await declareSale(admin, opId, salePrice, new Date());
  await prepareClosure(finance, opId);
  await validateClosure(finance2, opId);
}

describe("portefeuille et dépôts", () => {
  it("un dépôt crédite le portefeuille par une écriture traçable", async () => {
    const inv = await makeUser();
    await fund(finance, inv.id, 50_000n);
    expect(await walletBalance(inv.id)).toBe(50_000n);
    const tx = await prisma.ledgerTransaction.findFirstOrThrow({ where: { type: "DEPOSIT" }, include: { entries: true } });
    expect(tx.entries.reduce((a, e) => a + e.amount, 0n)).toBe(0n);
  });

  it("une même référence de paiement ne crédite qu'une fois", async () => {
    const inv = await makeUser();
    const input = { userId: inv.id, amount: 10_000n, externalReference: "MOMO-123", reason: "test" };
    await creditDeposit(finance, input);
    expect(await code(creditDeposit(finance, input))).toBe("DUPLICATE_REFERENCE");
    expect(await walletBalance(inv.id)).toBe(10_000n);
  });

  it("dépôt minimum de 2 500 FCFA et réservé aux responsables financiers", async () => {
    const inv = await makeUser();
    expect(await code(creditDeposit(finance, { userId: inv.id, amount: 2_499n, externalReference: "A", reason: "x" }))).toBe("BELOW_MIN");
    expect(await code(creditDeposit(admin, { userId: inv.id, amount: 5_000n, externalReference: "B", reason: "x" }))).toBe("FORBIDDEN");
  });

  it("le grand livre est immuable au niveau de la base", async () => {
    const inv = await makeUser();
    await fund(finance, inv.id, 10_000n);
    const entry = await prisma.ledgerEntry.findFirstOrThrow();
    await expect(prisma.ledgerEntry.update({ where: { id: entry.id }, data: { amount: 999_999n } })).rejects.toThrow(/immuable/);
    await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/immuable/);
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow(/immuable/);
  });

  it("une transaction déséquilibrée est refusée par la base", async () => {
    const inv = await makeUser();
    const w = await prisma.ledgerAccount.findUniqueOrThrow({ where: { userId: inv.id } });
    await expect(
      prisma.ledgerTransaction.create({
        data: { reference: "X", idempotencyKey: "X", type: "ADJUSTMENT", description: "fraude", entries: { create: [{ accountId: w.id, amount: 1_000_000n }] } },
      }),
    ).rejects.toThrow(/déséquilibrée/);
    expect(await walletBalance(inv.id)).toBe(0n);
  });
});

describe("investissement", () => {
  it("contrôle compte vérifié, minimum, solde et plafond restant", async () => {
    const op = await openOperation(admin);
    const unverified = await makeUser("INVESTOR", false);
    const inv = await makeUser();
    await fund(finance, inv.id, 20_000n);
    const base = { operationId: op.id, riskAccepted: true, termsVersion: "t" };
    expect(await code(invest({ ...base, userId: unverified.id, amount: 5_000n, idempotencyKey: key() }))).toBe("ACCOUNT_NOT_AUTHORIZED");
    expect(await code(invest({ ...base, userId: inv.id, amount: 2_000n, idempotencyKey: key() }))).toBe("BELOW_MIN");
    expect(await code(invest({ ...base, userId: inv.id, amount: 30_000n, idempotencyKey: key() }))).toBe("INSUFFICIENT_FUNDS");
    expect(await code(invest({ ...base, userId: inv.id, amount: 5_000n, idempotencyKey: key(), riskAccepted: false }))).toBe("RISK_NOT_ACCEPTED");
    expect(await code(invest({ ...base, userId: inv.id, amount: 5_000n, idempotencyKey: key() }))).toBe("OK");
    expect(await walletBalance(inv.id)).toBe(15_000n);
  });

  it("refuse d'investir dans une opération non ouverte", async () => {
    const op = await openOperation(admin);
    await transitionOperation(admin, op.id, "SUSPENDED", "Contrôle");
    const inv = await makeUser();
    await fund(finance, inv.id, 20_000n);
    expect(await code(invest({ userId: inv.id, operationId: op.id, amount: 5_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" }))).toBe("NOT_INVESTABLE");
  });

  it("un double envoi du formulaire ne débite qu'une fois", async () => {
    const op = await openOperation(admin);
    const inv = await makeUser();
    await fund(finance, inv.id, 20_000n);
    const k = key();
    const input = { userId: inv.id, operationId: op.id, amount: 5_000n, idempotencyKey: k, riskAccepted: true, termsVersion: "t" };
    const [a, b] = await Promise.all([invest(input), invest(input)]);
    expect(a.investment.id).toBe(b.investment.id);
    expect(await walletBalance(inv.id)).toBe(15_000n);
    expect(await prisma.investment.count()).toBe(1);
  });

  it("des investissements concurrents ne dépassent jamais le solde", async () => {
    const op = await openOperation(admin);
    const inv = await makeUser();
    await fund(finance, inv.id, 10_000n);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => invest({ userId: inv.id, operationId: op.id, amount: 4_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await walletBalance(inv.id)).toBe(2_000n);
  });

  it("l'objectif atteint passe l'opération en « Financement atteint » sans dépassement", async () => {
    const op = await openOperation(admin, { acquisitionBudget: 110_000n, companyContribution: 100_000n, investorTarget: 10_000n });
    const users = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const u of users) await fund(finance, u.id, 10_000n);
    const results = await Promise.allSettled(
      users.map((u) => invest({ userId: u.id, operationId: op.id, amount: 5_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const after = await prisma.operation.findUniqueOrThrow({ where: { id: op.id } });
    expect(after.investorFunded).toBe(10_000n);
    expect(after.status).toBe("FUNDED");
  });

  it("annulation avant acquisition : remboursement intégral", async () => {
    const op = await openOperation(admin);
    const inv = await makeUser();
    await fund(finance, inv.id, 20_000n);
    await invest({ userId: inv.id, operationId: op.id, amount: 20_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    expect(await walletBalance(inv.id)).toBe(0n);
    await cancelOperation(admin, op.id, "Véhicule non conforme");
    expect(await walletBalance(inv.id)).toBe(20_000n);
    expect((await prisma.investment.findFirstOrThrow()).status).toBe("REFUNDED");
  });
});

describe("vente, clôture et réclamation", () => {
  async function scenario() {
    const op = await openOperation(admin);
    const a = await makeUser();
    const b = await makeUser();
    await fund(finance, a.id, 300_000n);
    await fund(finance, b.id, 200_000n);
    await invest({ userId: a.id, operationId: op.id, amount: 300_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    await invest({ userId: b.id, operationId: op.id, amount: 200_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("FUNDED");
    return { op, a, b };
  }

  it("exemple du CDC de bout en bout : 600 000 de bénéfice net", async () => {
    const { op, a, b } = await scenario();
    // vente 2 100 000 ; coûts 1 200 000 + 300 000 = 1 500 000 → B = 600 000
    await sellAndClose(op.id, 2_100_000n, [1_200_000n, 300_000n]);

    const closure = await prisma.operationClosure.findUniqueOrThrow({ where: { operationId: op.id } });
    expect(closure.netResult).toBe(600_000n);
    expect(closure.companyTheoreticalShare).toBe(400_000n);
    expect(closure.companyFinalShare).toBe(200_000n);
    expect(closure.investorsEnvelope).toBe(400_000n);

    // la vente/clôture ne crédite rien automatiquement
    expect(await walletBalance(a.id)).toBe(0n);

    const sa = await prisma.investorSettlement.findFirstOrThrow({ where: { userId: a.id } });
    const sb = await prisma.investorSettlement.findFirstOrThrow({ where: { userId: b.id } });
    expect(sa.claimable).toBe(540_000n);
    expect(sb.claimable).toBe(360_000n);

    // réclamations répétées et concurrentes : un seul crédit
    await Promise.all([claimSettlement(a.id, sa.id), claimSettlement(a.id, sa.id), claimSettlement(a.id, sa.id)]);
    await claimSettlement(a.id, sa.id);
    expect(await walletBalance(a.id)).toBe(540_000n);
    await claimSettlement(b.id, sb.id);
    expect(await walletBalance(b.id)).toBe(360_000n);

    // écritures distinctes capital / bénéfice
    const claimTx = await prisma.ledgerTransaction.findFirstOrThrow({ where: { type: "CLAIM", settlement: { id: sa.id } }, include: { entries: true } });
    expect(claimTx.entries.map((e) => e.memo)).toContain("Bénéfice de l'opération");

    // le pool de l'opération est soldé, le grand livre global est équilibré
    const pool = await prisma.ledgerAccount.findUniqueOrThrow({ where: { operationId: op.id } });
    const poolSum = await prisma.ledgerEntry.aggregate({ where: { accountId: pool.id }, _sum: { amount: true } });
    expect(poolSum._sum.amount).toBe(0n);
    const all = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
    expect(all._sum.amount).toBe(0n);
  });

  it("un investisseur ne peut pas réclamer le règlement d'un autre", async () => {
    const { op, a, b } = await scenario();
    await sellAndClose(op.id, 2_100_000n, [1_500_000n]);
    const sa = await prisma.investorSettlement.findFirstOrThrow({ where: { userId: a.id } });
    expect(await code(claimSettlement(b.id, sa.id))).toBe("NOT_FOUND");
  });

  it("double approbation : la clôture est validée par une autre personne", async () => {
    const { op } = await scenario();
    for (const s of ["ACQUISITION", "READY_FOR_SALE", "ON_SALE"] as const) await transitionOperation(admin, op.id, s);
    const e = await addExpense(admin, op.id, { category: "ACQUISITION", label: "Achat", amount: 1_400_000n, incurredAt: new Date() });
    expect(await code(reviewExpense(admin, e.id, "APPROVED"))).toBe("FORBIDDEN");
    await reviewExpense(finance, e.id, "APPROVED");
    await declareSale(admin, op.id, 1_800_000n, new Date());
    await prepareClosure(finance, op.id);
    expect(await code(validateClosure(finance, op.id))).toBe("FOUR_EYES");
    expect(await code(validateClosure(admin, op.id))).toBe("FORBIDDEN");
    expect(await code(validateClosure(finance2, op.id))).toBe("OK");
  });

  it("l'auteur d'une dépense ne peut pas la valider", async () => {
    const { op } = await scenario();
    await transitionOperation(admin, op.id, "ACQUISITION");
    const e = await addExpense(finance, op.id, { category: "PARTS", label: "Pièces", amount: 10_000n, incurredAt: new Date() });
    expect(await code(reviewExpense(finance, e.id, "APPROVED"))).toBe("FOUR_EYES");
  });

  it("dépenses en attente ou absentes : clôture refusée", async () => {
    const { op } = await scenario();
    for (const s of ["ACQUISITION", "READY_FOR_SALE", "ON_SALE"] as const) await transitionOperation(admin, op.id, s);
    await declareSale(admin, op.id, 1_800_000n, new Date());
    expect(await code(prepareClosure(finance, op.id))).toBe("NO_COSTS");
  });

  it("perte : clôture bloquée tant que la règle n'est pas approuvée, puis appliquée", async () => {
    const { op, a } = await scenario();
    for (const s of ["ACQUISITION", "READY_FOR_SALE", "ON_SALE"] as const) await transitionOperation(admin, op.id, s);
    const e = await addExpense(admin, op.id, { category: "ACQUISITION", label: "Achat", amount: 1_500_000n, incurredAt: new Date() });
    await reviewExpense(finance, e.id, "APPROVED");
    await declareSale(admin, op.id, 1_200_000n, new Date()); // B = −300 000
    expect(await code(prepareClosure(finance, op.id))).toBe("LOSS_RULE_UNSET");

    await updateSetting(superAdmin, "LOSS_RULE", "PROPORTIONAL", "Décision du comité");
    await prepareClosure(finance, op.id);
    await validateClosure(finance2, op.id);
    const sa = await prisma.investorSettlement.findFirstOrThrow({ where: { userId: a.id } });
    expect(sa.result).toBe(-60_000n);
    await claimSettlement(a.id, sa.id);
    expect(await walletBalance(a.id)).toBe(240_000n);
    const all = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
    expect(all._sum.amount).toBe(0n);
  });

  it("une modification après préparation impose un recalcul", async () => {
    const { op } = await scenario();
    for (const s of ["ACQUISITION", "READY_FOR_SALE", "ON_SALE"] as const) await transitionOperation(admin, op.id, s);
    const e = await addExpense(admin, op.id, { category: "ACQUISITION", label: "Achat", amount: 1_000_000n, incurredAt: new Date() });
    await reviewExpense(finance, e.id, "APPROVED");
    await declareSale(admin, op.id, 1_800_000n, new Date());
    await prepareClosure(finance, op.id);
    await updateSetting(superAdmin, "LOSS_RULE", "PROPORTIONAL", "changement");
    expect(await code(validateClosure(finance2, op.id))).toBe("STALE_CLOSURE");
  });

  it("une opération clôturée est figée", async () => {
    const { op } = await scenario();
    await sellAndClose(op.id, 2_100_000n, [1_500_000n]);
    expect(await code(addExpense(admin, op.id, { category: "OTHER", label: "x", amount: 1_000n, incurredAt: new Date() }))).toBe("LOCKED");
    expect(await code(transitionOperation(admin, op.id, "SUSPENDED", "x"))).toBe("INVALID_TRANSITION");
    expect(await code(prepareClosure(finance, op.id))).toBe("INVALID_STATE");
  });

  it("chaque action sensible est journalisée", async () => {
    const { op } = await scenario();
    await sellAndClose(op.id, 2_100_000n, [1_500_000n]);
    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ["wallet.deposit.credit", "investment.create", "expense.approved", "operation.sale", "closure.prepare", "closure.validate"])
      expect(actions).toContain(a);
  });
});

describe("rapprochements", () => {
  it("tous les contrôles passent après un cycle complet, y compris avant réclamation", async () => {
    const { runReconciliation } = await import("@/lib/services/reconciliation");
    const op = await openOperation(admin);
    const a = await makeUser();
    await fund(finance, a.id, 500_000n);
    await invest({ userId: a.id, operationId: op.id, amount: 500_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    const open2 = await openOperation(admin, { title: "Autre" });
    const b = await makeUser();
    await fund(finance, b.id, 10_000n);
    await invest({ userId: b.id, operationId: open2.id, amount: 7_500n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    await sellAndClose(op.id, 2_100_000n, [1_500_000n]);
    const checks = await runReconciliation();
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });
});
