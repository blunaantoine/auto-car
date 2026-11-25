// Agents locaux, moyens de paiement et taux de change — CDC §9.3, §12 « Gestion internationale ».
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AgentStatus } from "@prisma/client";
import { inTransaction, prisma, type Tx } from "../db";
import { FIXED_PARITY, formatRate, parseRate } from "../domain/deposit";
import { DomainError } from "../errors";
import { audit } from "./audit";
import { requirePermission, type Actor } from "./types";

// ─────────────────────────── Taux de change ───────────────────────────

/** Taux en vigueur pour une devise (1 unité = x XOF). Parité fixe pour XOF/XAF. */
export async function currentRate(currency: string, db: Tx | typeof prisma = prisma): Promise<{ rate: string; source: string } | null> {
  const fixed = FIXED_PARITY[currency];
  if (fixed) return { rate: fixed, source: "Parité fixe FCFA" };
  const r = await db.exchangeRate.findFirst({ where: { currency, effectiveAt: { lte: new Date() } }, orderBy: { effectiveAt: "desc" } });
  return r ? { rate: formatRate(parseRate(r.rateToRef.toString())), source: r.source } : null;
}

export async function addExchangeRate(actor: Actor, input: { currency: string; rate: string; source: string }) {
  requirePermission(actor, "rates.manage");
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new DomainError("INVALID", "Code devise ISO à 3 lettres attendu.");
  if (FIXED_PARITY[currency]) throw new DomainError("INVALID", `${currency} est à parité fixe avec le FCFA : aucun taux à saisir.`);
  let rate: string;
  try {
    rate = formatRate(parseRate(input.rate.replace(",", ".")));
  } catch {
    throw new DomainError("INVALID", "Taux invalide (ex. 655.957).");
  }
  if (!input.source.trim()) throw new DomainError("INVALID", "La source du taux est obligatoire.");
  await inTransaction(async (tx) => {
    const r = await tx.exchangeRate.create({ data: { currency, rateToRef: rate, source: input.source.trim(), createdById: actor.id } });
    await audit(tx, actor, { action: "rate.add", entityType: "ExchangeRate", entityId: r.id, after: { currency, rate, source: input.source } });
  });
}

// ─────────────────────────── Agents ───────────────────────────

export interface AgentInput {
  displayName: string;
  countryCode: string;
  city: string;
  zone: string | null;
  hours: string | null;
  instructions: string | null;
  supportContact: string | null;
  canDeposit: boolean;
  status: AgentStatus;
}

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join("") + String(randomInt(10));
}

/**
 * Crée un agent. Si l'e-mail correspond à un compte existant, il devient agent (à condition de ne pas
 * avoir d'activité d'investisseur : séparation des rôles) ; sinon un compte est créé avec un mot de passe
 * temporaire, renvoyé une seule fois.
 */
export async function createAgent(
  actor: Actor,
  input: AgentInput & { email: string; firstName: string; lastName: string },
): Promise<{ agentId: string; tempPassword: string | null }> {
  requirePermission(actor, "agents.manage");
  const email = input.email.trim().toLowerCase();
  const country = await prisma.country.findUnique({ where: { code: input.countryCode } });
  if (!country) throw new DomainError("INVALID", "Pays inconnu.");
  const existing = await prisma.user.findUnique({ where: { email }, include: { agent: true, investments: { take: 1 } } });
  let temp: string | null = null;
  let passwordHash: string | null = null;
  if (!existing) {
    temp = tempPassword();
    passwordHash = await bcrypt.hash(temp, 12);
  }
  const agentId = await inTransaction(async (tx) => {
    let userId: string;
    if (existing) {
      if (existing.agent) throw new DomainError("ALREADY", "Ce compte est déjà agent.");
      if (existing.role !== "INVESTOR" && existing.role !== "AGENT")
        throw new DomainError("FORBIDDEN", "Un membre du personnel ne peut pas être agent.");
      if (existing.investments.length > 0)
        throw new DomainError("CONFLICT", "Ce compte a déjà investi : utilisez un compte distinct pour l'agent.");
      await tx.user.update({ where: { id: existing.id }, data: { role: "AGENT" } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      userId = existing.id;
    } else {
      const u = await tx.user.create({
        data: {
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          passwordHash: passwordHash!,
          countryCode: country.code,
          city: input.city,
          role: "AGENT",
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      userId = u.id;
    }
    const agent = await tx.agent.create({
      data: {
        userId,
        displayName: input.displayName.trim(),
        countryCode: country.code,
        city: input.city.trim(),
        zone: input.zone,
        hours: input.hours,
        instructions: input.instructions,
        supportContact: input.supportContact,
        canDeposit: input.canDeposit,
        status: input.status,
      },
    });
    await audit(tx, actor, { action: "agent.create", entityType: "Agent", entityId: agent.id, after: { ...input, email, newAccount: !existing } });
    return agent.id;
  });
  return { agentId, tempPassword: temp };
}

export async function updateAgent(actor: Actor, agentId: string, input: AgentInput, reason: string) {
  requirePermission(actor, "agents.manage");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  await inTransaction(async (tx) => {
    const a = await tx.agent.findUnique({ where: { id: agentId } });
    if (!a) throw new DomainError("NOT_FOUND", "Agent introuvable.");
    const country = await tx.country.findUnique({ where: { code: input.countryCode } });
    if (!country) throw new DomainError("INVALID", "Pays inconnu.");
    await tx.agent.update({ where: { id: agentId }, data: { ...input, displayName: input.displayName.trim(), city: input.city.trim() } });
    if (input.status === "SUSPENDED") await tx.session.deleteMany({ where: { userId: a.userId } });
    await audit(tx, actor, { action: "agent.update", entityType: "Agent", entityId: agentId, before: a, after: input, reason });
  });
}

export interface MethodInput {
  provider: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  minAmount: bigint;
  maxAmount: bigint | null;
  feeFixed: bigint;
  feeBps: number;
  delay: string | null;
}

function checkMethod(m: MethodInput) {
  if (!/^[A-Z]{3}$/.test(m.currency)) throw new DomainError("INVALID", "Devise ISO à 3 lettres attendue.");
  if (m.minAmount <= 0n) throw new DomainError("INVALID", "Le minimum doit être positif.");
  if (m.maxAmount !== null && m.maxAmount < m.minAmount) throw new DomainError("INVALID", "Le maximum est inférieur au minimum.");
  if (m.feeFixed < 0n || m.feeBps < 0 || m.feeBps >= 10_000) throw new DomainError("INVALID", "Frais invalides.");
}

export async function addPaymentMethod(actor: Actor, agentId: string, m: MethodInput) {
  requirePermission(actor, "agents.manage");
  checkMethod(m);
  if (!(await currentRate(m.currency))) throw new DomainError("NO_RATE", `Aucun taux de change pour ${m.currency} : ajoutez-le dans les paramètres.`);
  await inTransaction(async (tx) => {
    const a = await tx.agent.findUnique({ where: { id: agentId } });
    if (!a) throw new DomainError("NOT_FOUND", "Agent introuvable.");
    const pm = await tx.agentPaymentMethod.create({ data: { ...m, agentId } });
    await audit(tx, actor, { action: "agent.method.add", entityType: "AgentPaymentMethod", entityId: pm.id, after: m });
  });
}

export async function setPaymentMethodActive(actor: Actor, methodId: string, active: boolean) {
  requirePermission(actor, "agents.manage");
  await inTransaction(async (tx) => {
    const pm = await tx.agentPaymentMethod.findUnique({ where: { id: methodId } });
    if (!pm) throw new DomainError("NOT_FOUND", "Moyen de paiement introuvable.");
    await tx.agentPaymentMethod.update({ where: { id: methodId }, data: { active } });
    await audit(tx, actor, { action: active ? "agent.method.enable" : "agent.method.disable", entityType: "AgentPaymentMethod", entityId: methodId });
  });
}

/** Agents disponibles pour un dépôt dans un pays (actifs, avec au moins un moyen de paiement actif). */
export async function depositAgents(countryCode: string) {
  return prisma.agent.findMany({
    where: { countryCode, status: "ACTIVE", canDeposit: true, paymentMethods: { some: { active: true } } },
    include: { paymentMethods: { where: { active: true }, orderBy: { provider: "asc" } } },
    orderBy: [{ city: "asc" }, { displayName: "asc" }],
  });
}
