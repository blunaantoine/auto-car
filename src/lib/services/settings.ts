import { prisma, type Tx } from "../db";
import { LOSS_RULES, type LossRule } from "../domain/profit-sharing";
import { DomainError } from "../errors";
import { audit } from "./audit";
import { requirePermission, type Actor } from "./types";

// Paramètres administrables (CDC §22 : les valeurs à trancher restent configurables).
export const SETTING_DEFAULTS = {
  LOSS_RULE: "UNSET",
  MIN_DEPOSIT: "2500", // CDC §6.3
  MIN_INVESTMENT: "2500", // CDC §6.3
  TERMS_VERSION: "CG-2026-11-v1",
  // au-delà de ce montant (XOF), un dépôt confirmé par l'agent doit être validé par un responsable financier
  DEPOSIT_REVIEW_THRESHOLD: "500000",
  // délai après lequel une demande de dépôt non traitée par l'agent expire
  DEPOSIT_EXPIRY_HOURS: "72",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting(key: SettingKey, db: Tx | typeof prisma = prisma): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key];
}

export async function getLossRule(db: Tx | typeof prisma = prisma): Promise<LossRule> {
  const v = await getSetting("LOSS_RULE", db);
  return (LOSS_RULES as readonly string[]).includes(v) ? (v as LossRule) : "UNSET";
}

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany();
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, string>;
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function updateSetting(actor: Actor, key: SettingKey, value: string, reason: string) {
  requirePermission(actor, "settings.manage");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  if (key === "LOSS_RULE" && !(LOSS_RULES as readonly string[]).includes(value))
    throw new DomainError("INVALID", "Règle de perte inconnue.");
  if (["MIN_DEPOSIT", "MIN_INVESTMENT", "DEPOSIT_REVIEW_THRESHOLD", "DEPOSIT_EXPIRY_HOURS"].includes(key) && !/^\d+$/.test(value))
    throw new DomainError("INVALID", "Montant invalide.");
  await prisma.$transaction(async (tx) => {
    const before = await getSetting(key, tx);
    await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    await audit(tx, actor, { action: "setting.update", entityType: "Setting", entityId: key, before, after: value, reason });
  });
}
