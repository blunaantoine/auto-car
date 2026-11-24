import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserWallet } from "@/lib/ledger/ledger";
import { creditDeposit } from "@/lib/services/wallet";
import { createOperation, type OperationInput } from "@/lib/services/operations";
import type { Actor } from "@/lib/services/types";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // TRUNCATE ne déclenche pas les triggers d'immuabilité (niveau ligne).
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await prisma.country.create({
    data: { code: "TG", name: "Togo", flag: "🇹🇬", dialCode: "+228", currency: "XOF", timezone: "Africa/Lome" },
  });
}

let n = 0;
export async function makeUser(role: Role = "INVESTOR", verified = true): Promise<Actor> {
  n++;
  const u = await prisma.user.create({
    data: {
      email: `user${n}-${Date.now()}@test.local`,
      firstName: `Prénom${n}`,
      lastName: "Test",
      passwordHash: "x",
      countryCode: "TG",
      role,
      status: verified ? "ACTIVE" : "PENDING_VERIFICATION",
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
  await prisma.$transaction((tx) => getUserWallet(tx, u.id));
  return { id: u.id, role: u.role };
}

export async function fund(finance: Actor, userId: string, amount: bigint) {
  return creditDeposit(finance, { userId, amount, externalReference: `REF-${userId}-${n++}`, reason: "test" });
}

export const baseOperation = (over: Partial<OperationInput> = {}): OperationInput => ({
  title: "Toyota Corolla 2015 — Lomé",
  description: "Véhicule accidenté à l'avant.",
  risks: "Surcoût de réparation, baisse du prix de revente.",
  make: "Toyota",
  model: "Corolla",
  year: 2015,
  condition: "Accidenté",
  damageDescription: "Pare-chocs et capot",
  location: "Lomé",
  photos: [],
  acquisitionBudget: 1_500_000n,
  companyContribution: 1_000_000n,
  investorTarget: 500_000n,
  minInvestment: 2_500n,
  maxPerInvestor: null,
  estimatedDurationDays: 60,
  budgetLines: [],
  ...over,
});

export async function openOperation(admin: Actor, over: Partial<OperationInput> = {}) {
  const { transitionOperation } = await import("@/lib/services/operations");
  const op = await createOperation(admin, baseOperation(over));
  for (const s of ["IN_REVIEW", "PUBLISHED", "FUNDING_OPEN"] as const) await transitionOperation(admin, op.id, s);
  return op;
}

export async function walletBalance(userId: string) {
  const w = await prisma.ledgerAccount.findUniqueOrThrow({ where: { userId } });
  const agg = await prisma.ledgerEntry.aggregate({ where: { accountId: w.id }, _sum: { amount: true } });
  return agg._sum.amount ?? 0n;
}

export const key = () => `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;
