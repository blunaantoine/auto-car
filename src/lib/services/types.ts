import type { Role } from "@prisma/client";
import { can, type Permission } from "../auth/permissions";
import { DomainError } from "../errors";

export interface Actor {
  id: string;
  role: Role;
  ip?: string | null;
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) {
    throw new DomainError("FORBIDDEN", "Vous n'avez pas les droits nécessaires pour cette action.");
  }
}
