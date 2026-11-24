import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import type { Actor } from "./types";

/** Convertit les BigInt en chaînes pour le stockage JSON. */
export function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export async function audit(
  tx: Tx,
  actor: Actor | null,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? "SYSTEM",
      ip: actor?.ip ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      reason: entry.reason ?? null,
    },
  });
}

export async function notify(tx: Tx, userId: string, title: string, body: string, link?: string) {
  await tx.notification.create({ data: { userId, title, body, link } });
}
