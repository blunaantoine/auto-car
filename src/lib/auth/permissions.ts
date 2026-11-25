import type { Role } from "@prisma/client";

// Matrice des permissions — CDC §3. Les rôles cumulés gardent des permissions séparées.
export const PERMISSIONS = {
  "operations.manage": ["ADMIN", "SUPER_ADMIN"],
  // corriger les montants d'une opération déjà publiée (avec motif, audit et notification)
  "operations.correct": ["SUPER_ADMIN"],
  "expenses.record": ["ADMIN", "FINANCE", "SUPER_ADMIN"],
  "expenses.review": ["FINANCE", "SUPER_ADMIN"],
  "closure.prepare": ["ADMIN", "FINANCE", "SUPER_ADMIN"],
  "closure.validate": ["FINANCE", "SUPER_ADMIN"],
  "wallet.credit": ["FINANCE", "SUPER_ADMIN"],
  "users.manage": ["ADMIN", "SUPER_ADMIN"],
  "roles.manage": ["SUPER_ADMIN"],
  // gérer les comptes du personnel (admin, finance) et réinitialiser les mots de passe
  "staff.manage": ["SUPER_ADMIN"],
  "settings.manage": ["SUPER_ADMIN"],
  "countries.manage": ["ADMIN", "SUPER_ADMIN"],
  "audit.read": ["ADMIN", "FINANCE", "SUPER_ADMIN"],
  "ledger.read": ["ADMIN", "FINANCE", "SUPER_ADMIN"],
  "backoffice.access": ["ADMIN", "FINANCE", "SUPER_ADMIN"],
  // agents locaux et dépôts (CDC §9, §11, §12)
  "agent.access": ["AGENT"],
  "agents.manage": ["ADMIN", "SUPER_ADMIN"],
  "deposits.review": ["FINANCE", "SUPER_ADMIN"],
  "rates.manage": ["FINANCE", "SUPER_ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  INVESTOR: "Investisseur",
  AGENT: "Agent local",
  ADMIN: "Administrateur",
  FINANCE: "Responsable financier",
  SUPER_ADMIN: "Super administrateur",
};
