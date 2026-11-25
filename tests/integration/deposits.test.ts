// Dépôts par agents locaux — recette CDC §9 et §20 (« Dépôt », « Doublons », « Agents »).
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addExchangeRate, addPaymentMethod, createAgent, depositAgents } from "@/lib/services/agents";
import {
  agentConfirmDeposit,
  agentRejectDeposit,
  cancelDeposit,
  disputeDeposit,
  expireStaleDeposits,
  financeValidateDeposit,
  submitDeposit,
} from "@/lib/services/deposits";
import { invest } from "@/lib/services/investment";
import { updateSetting } from "@/lib/services/settings";
import { getWalletSummary } from "@/lib/services/wallet";
import type { Actor } from "@/lib/services/types";
import { key, makeUser, openOperation, resetDb, walletBalance } from "./helpers";

const code = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { if (e instanceof DomainError) return e.code; throw e; }
};

let admin: Actor, finance: Actor, superAdmin: Actor, investor: Actor;
let agentActor: Actor, agentId: string, methodId: string;

async function newAgent(email: string, status: "ACTIVE" | "PENDING" = "ACTIVE") {
  const { agentId: id, tempPassword } = await createAgent(admin, {
    email, firstName: "Kossi", lastName: "Agent", displayName: `Agent ${email}`, countryCode: "TG", city: "Lomé",
    zone: "Bè", hours: "8h–18h", instructions: null, supportContact: null, canDeposit: true, status,
  });
  const a = await prisma.agent.findUniqueOrThrow({ where: { id }, include: { user: true } });
  return { id, actor: { id: a.userId, role: a.user.role } as Actor, tempPassword };
}

beforeEach(async () => {
  await resetDb();
  admin = await makeUser("ADMIN");
  finance = await makeUser("FINANCE");
  superAdmin = await makeUser("SUPER_ADMIN");
  investor = await makeUser();
  const a = await newAgent("agent1@test.local");
  agentActor = a.actor;
  agentId = a.id;
  await addPaymentMethod(admin, agentId, {
    provider: "Flooz", accountName: "Kossi Agent", accountNumber: "+228 90 00 00 00", currency: "XOF",
    minAmount: 2_500n, maxAmount: 2_000_000n, feeFixed: 0n, feeBps: 100, delay: "15 min",
  });
  methodId = (await prisma.agentPaymentMethod.findFirstOrThrow({ where: { agentId } })).id;
});

const submit = (over: Partial<Parameters<typeof submitDeposit>[0]> = {}) =>
  submitDeposit({ userId: investor.id, methodId, amountLocal: 101_000n, payerReference: `MP${Math.random().toString(36).slice(2, 10)}`, ...over });

describe("création des agents", () => {
  it("un nouveau compte agent reçoit un mot de passe temporaire et le rôle AGENT", async () => {
    const a = await newAgent("nouvel-agent@test.local");
    expect(a.tempPassword).toMatch(/^.{15}$/);
    expect(a.actor.role).toBe("AGENT");
  });

  it("un compte qui a investi ne peut pas devenir agent", async () => {
    const op = await openOperation(admin);
    const { creditDeposit } = await import("@/lib/services/wallet");
    await creditDeposit(finance, { userId: investor.id, amount: 10_000n, externalReference: "X1", reason: "t" });
    await invest({ userId: investor.id, operationId: op.id, amount: 5_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: investor.id } })).email;
    expect(await code(createAgent(admin, { email, firstName: "", lastName: "", displayName: "X", countryCode: "TG", city: "Lomé", zone: null, hours: null, instructions: null, supportContact: null, canDeposit: true, status: "ACTIVE" }))).toBe("CONFLICT");
  });

  it("seuls les agents actifs avec un moyen actif sont proposés", async () => {
    await newAgent("en-attente@test.local", "PENDING");
    const list = await depositAgents("TG");
    expect(list.map((a) => a.id)).toEqual([agentId]);
  });
});

describe("parcours de dépôt", () => {
  it("frais et montant crédité figés ; en attente, rien n'est investissable", async () => {
    const d = await submit();
    expect(d).toMatchObject({ status: "AWAITING_AGENT", feeLocal: 1_010n, amountCredited: 99_990n });
    expect(await walletBalance(investor.id)).toBe(0n);
    expect((await getWalletSummary(investor.id)).pending).toBe(99_990n);
  });

  it("confirmation par l'agent sous le seuil : crédit immédiat, une seule fois", async () => {
    const d = await submit();
    expect(await agentConfirmDeposit(agentActor, d.id, "FLZ-998877")).toBe("CREDITED");
    expect(await walletBalance(investor.id)).toBe(99_990n);
    expect(await code(agentConfirmDeposit(agentActor, d.id, "FLZ-998877"))).toBe("ALREADY_PROCESSED");
    expect(await code(financeValidateDeposit(finance, d.id))).toBe("ALREADY_PROCESSED");
    expect(await walletBalance(investor.id)).toBe(99_990n);
    expect((await getWalletSummary(investor.id)).pending).toBe(0n);
  });

  it("confirmations concurrentes : un seul crédit", async () => {
    const d = await submit();
    await Promise.allSettled([agentConfirmDeposit(agentActor, d.id, "REF-1"), agentConfirmDeposit(agentActor, d.id, "REF-1"), agentConfirmDeposit(agentActor, d.id, "REF-1")]);
    expect(await walletBalance(investor.id)).toBe(99_990n);
  });

  it("au-delà du seuil : validation financière obligatoire", async () => {
    await updateSetting(superAdmin, "DEPOSIT_REVIEW_THRESHOLD", "50000", "test");
    const d = await submit();
    expect(await agentConfirmDeposit(agentActor, d.id, "FLZ-1")).toBe("CONFIRMED_BY_AGENT");
    expect(await walletBalance(investor.id)).toBe(0n);
    expect(await code(financeValidateDeposit(admin, d.id))).toBe("FORBIDDEN");
    await financeValidateDeposit(finance, d.id, "Relevé vérifié");
    expect(await walletBalance(investor.id)).toBe(99_990n);
  });

  it("une même référence d'opérateur ne peut pas être déclarée deux fois", async () => {
    await submit({ payerReference: "MP12345" });
    expect(await code(submit({ payerReference: " mp12345 " }))).toBe("DUPLICATE_REFERENCE");
  });

  it("un agent ne voit ni ne traite les demandes d'un autre agent", async () => {
    const other = await newAgent("agent2@test.local");
    const d = await submit();
    expect(await code(agentConfirmDeposit(other.actor, d.id, "REF-X"))).toBe("NOT_FOUND");
    expect(await code(agentConfirmDeposit(investor, d.id, "REF-X"))).toBe("FORBIDDEN");
  });

  it("rejet, annulation, expiration, litige", async () => {
    const a = await submit();
    await agentRejectDeposit(agentActor, a.id, "Aucun paiement reçu");
    const b = await submit();
    await cancelDeposit(investor.id, b.id);
    const c = await submit();
    await prisma.depositRequest.update({ where: { id: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await code(agentConfirmDeposit(agentActor, c.id, "REF-X"))).toBe("EXPIRED");
    await expireStaleDeposits();
    const e = await submit();
    await disputeDeposit(finance, e.id, "Montant contesté");
    expect(await code(agentConfirmDeposit(agentActor, e.id, "REF-X"))).toBe("ALREADY_PROCESSED");
    const statuses = await prisma.depositRequest.findMany({ orderBy: { createdAt: "asc" }, select: { status: true } });
    expect(statuses.map((s) => s.status)).toEqual(["REJECTED", "CANCELLED", "EXPIRED", "DISPUTED"]);
    expect(await walletBalance(investor.id)).toBe(0n);
  });

  it("limites du moyen de paiement et dépôt minimum après frais", async () => {
    expect(await code(submit({ amountLocal: 2_000n }))).toBe("BELOW_MIN");
    expect(await code(submit({ amountLocal: 3_000_000n }))).toBe("ABOVE_MAX");
    expect(await code(submit({ amountLocal: 2_500n }))).toBe("BELOW_MIN"); // 2 500 − 25 de frais < 2 500
  });

  it("conversion depuis une autre devise avec le taux en vigueur, figé dans la demande", async () => {
    await prisma.country.create({ data: { code: "GH", name: "Ghana", flag: "🇬🇭", dialCode: "+233", currency: "GHS", timezone: "Africa/Accra" } });
    expect(await code(addPaymentMethod(admin, agentId, { provider: "MTN MoMo", accountName: "A", accountNumber: "1", currency: "GHS", minAmount: 50n, maxAmount: null, feeFixed: 0n, feeBps: 0, delay: null }))).toBe("NO_RATE");
    await addExchangeRate(finance, { currency: "GHS", rate: "52,5", source: "BCEAO 25/11/2026" });
    await addPaymentMethod(admin, agentId, { provider: "MTN MoMo", accountName: "A", accountNumber: "1", currency: "GHS", minAmount: 50n, maxAmount: null, feeFixed: 0n, feeBps: 0, delay: null });
    const ghs = await prisma.agentPaymentMethod.findFirstOrThrow({ where: { currency: "GHS" } });
    const d = await submit({ methodId: ghs.id, amountLocal: 1_000n });
    expect(d.amountCredited).toBe(52_500n);
    await addExchangeRate(finance, { currency: "GHS", rate: "60", source: "nouveau" });
    await agentConfirmDeposit(agentActor, d.id, "MOMO-1");
    expect(await walletBalance(investor.id)).toBe(52_500n); // le taux n'est jamais recalculé
    await expect(prisma.exchangeRate.deleteMany()).rejects.toThrow(/immuable/);
  });

  it("le grand livre reste équilibré", async () => {
    const d = await submit();
    await agentConfirmDeposit(agentActor, d.id, "REF-R");
    const all = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
    expect(all._sum.amount).toBe(0n);
  });
});
