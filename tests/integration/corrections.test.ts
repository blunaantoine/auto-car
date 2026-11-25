// Corrections après publication et gestion des comptes par l'administration.
import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { invest } from "@/lib/services/investment";
import { correctOperationFinancials, editOperationDetails, transitionOperation } from "@/lib/services/operations";
import { adminResetPassword, markEmailVerified, setUserStatus, updateUserProfile } from "@/lib/services/auth";
import type { Actor } from "@/lib/services/types";
import { baseOperation, fund, key, makeUser, openOperation, resetDb } from "./helpers";

const code = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { if (e instanceof DomainError) return e.code; throw e; }
};

let admin: Actor, finance: Actor, superAdmin: Actor;
beforeEach(async () => {
  await resetDb();
  admin = await makeUser("ADMIN");
  finance = await makeUser("FINANCE");
  superAdmin = await makeUser("SUPER_ADMIN");
});

const details = (title: string) => {
  const b = baseOperation();
  return { title, description: b.description, risks: b.risks, make: b.make, model: b.model, year: 2016, condition: b.condition,
    damageDescription: b.damageDescription, location: b.location, estimatedDurationDays: 90 };
};
const money = (over: Partial<{ companyContribution: bigint; investorTarget: bigint }> = {}) => ({
  companyContribution: 1_000_000n, investorTarget: 500_000n, minInvestment: 2_500n, maxPerInvestor: null, budgetLines: [], ...over,
});

describe("correction de la fiche après publication", () => {
  it("un admin corrige les textes avec motif ; les investisseurs sont prévenus", async () => {
    const op = await openOperation(admin);
    const u = await makeUser();
    await fund(finance, u.id, 10_000n);
    await invest({ userId: u.id, operationId: op.id, amount: 5_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    expect(await code(editOperationDetails(admin, op.id, details("Nouveau titre"), ""))).toBe("REASON_REQUIRED");
    await editOperationDetails(admin, op.id, details("Nouveau titre"), "Faute de frappe");
    const after = await prisma.operation.findUniqueOrThrow({ where: { id: op.id }, include: { vehicle: true } });
    expect(after.title).toBe("Nouveau titre");
    expect(after.estimatedDurationDays).toBe(90);
    expect(await prisma.notification.count({ where: { userId: u.id, title: { startsWith: "Fiche corrigée" } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "operation.details.correct" } })).toBe(1);
  });
});

describe("correction des montants (super administrateur)", () => {
  it("réservée au super administrateur", async () => {
    const op = await openOperation(admin);
    expect(await code(correctOperationFinancials(admin, op.id, money({ companyContribution: 900_000n }), "x"))).toBe("FORBIDDEN");
    expect(await code(correctOperationFinancials(superAdmin, op.id, money({ companyContribution: 900_000n }), "Erreur de saisie"))).toBe("OK");
    const after = await prisma.operation.findUniqueOrThrow({ where: { id: op.id } });
    expect(after.companyContribution).toBe(900_000n);
    expect(after.acquisitionBudget).toBe(1_400_000n);
  });

  it("jamais sous le montant déjà investi ; l'état de financement suit l'objectif", async () => {
    const op = await openOperation(admin);
    const u = await makeUser();
    await fund(finance, u.id, 100_000n);
    await invest({ userId: u.id, operationId: op.id, amount: 100_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    expect(await code(correctOperationFinancials(superAdmin, op.id, money({ investorTarget: 50_000n }), "x"))).toBe("BELOW_FUNDED");
    await correctOperationFinancials(superAdmin, op.id, money({ investorTarget: 100_000n }), "Objectif surestimé");
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("FUNDED");
    await correctOperationFinancials(superAdmin, op.id, money({ investorTarget: 200_000n }), "Objectif sous-estimé");
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("FUNDING_OPEN");
  });

  it("après le financement, le montant recherché reste figé ; après clôture, tout est figé", async () => {
    const op = await openOperation(admin, { acquisitionBudget: 1_010_000n, investorTarget: 10_000n });
    const u = await makeUser();
    await fund(finance, u.id, 10_000n);
    await invest({ userId: u.id, operationId: op.id, amount: 10_000n, idempotencyKey: key(), riskAccepted: true, termsVersion: "t" });
    await transitionOperation(admin, op.id, "ACQUISITION");
    expect(await code(correctOperationFinancials(superAdmin, op.id, money({ investorTarget: 20_000n }), "x"))).toBe("FUNDING_CLOSED");
    expect(await code(correctOperationFinancials(superAdmin, op.id, money({ investorTarget: 10_000n, companyContribution: 1_100_000n }), "Apport corrigé"))).toBe("OK");
    await prisma.operation.update({ where: { id: op.id }, data: { status: "CLOSED" } });
    expect(await code(correctOperationFinancials(superAdmin, op.id, money({ investorTarget: 10_000n }), "x"))).toBe("LOCKED");
  });
});

describe("gestion des comptes", () => {
  it("un admin gère les investisseurs mais pas le personnel", async () => {
    const inv = await makeUser("INVESTOR", false);
    const profile = { firstName: "Jean", lastName: "Corrigé", email: "jean@test.local", phone: null, countryCode: "TG", city: "Lomé" };
    await updateUserProfile(admin, inv.id, profile, "Nom mal orthographié");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: inv.id } })).lastName).toBe("Corrigé");
    await markEmailVerified(admin, inv.id, "Identité vérifiée par téléphone");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("ACTIVE");
    expect(await code(setUserStatus(admin, finance.id, "SUSPENDED", "x"))).toBe("FORBIDDEN");
    expect(await code(updateUserProfile(admin, finance.id, { ...profile, email: "f@test.local" }, "x"))).toBe("FORBIDDEN");
    expect(await code(setUserStatus(superAdmin, finance.id, "SUSPENDED", "Départ"))).toBe("OK");
  });

  it("e-mail déjà utilisé refusé", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const bEmail = (await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).email;
    expect(await code(updateUserProfile(admin, a.id, { firstName: "A", lastName: "B", email: bEmail, phone: null, countryCode: "TG", city: null }, "x"))).toBe("EMAIL_TAKEN");
  });

  it("réinitialisation du mot de passe par le super administrateur, sessions fermées", async () => {
    const inv = await makeUser();
    await prisma.session.create({ data: { tokenHash: "h", userId: inv.id, expiresAt: new Date(Date.now() + 1e6) } });
    expect(await code(adminResetPassword(admin, inv.id, "x"))).toBe("FORBIDDEN");
    const temp = await adminResetPassword(superAdmin, inv.id, "Mot de passe oublié");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: inv.id } });
    expect(await bcrypt.compare(temp, u.passwordHash)).toBe(true);
    expect(await prisma.session.count({ where: { userId: inv.id } })).toBe(0);
  });
});
