// États d'une opération et transitions autorisées — CDC §4.
import type { OperationStatus } from "@prisma/client";

export const STATUS_LABELS: Record<OperationStatus, string> = {
  DRAFT: "Brouillon",
  IN_REVIEW: "En vérification",
  PUBLISHED: "Publiée",
  FUNDING_OPEN: "Financement ouvert",
  FUNDED: "Financement atteint",
  ACQUISITION: "Acquisition en cours",
  REPAIR: "En réparation",
  READY_FOR_SALE: "Prêt à vendre",
  ON_SALE: "En vente",
  SOLD: "Vendu",
  CLOSING_PENDING: "Clôture financière en attente",
  CLOSED: "Clôturée",
  SUSPENDED: "Suspendue",
  CANCELLED: "Annulée",
  ARCHIVED: "Archivée",
};

/**
 * Transitions manuelles autorisées. Les transitions suivantes sont réservées au système :
 *  - FUNDING_OPEN → FUNDED (automatique quand l'objectif est atteint) ;
 *  - CLOSING_PENDING → CLOSED (uniquement par validation de la clôture) ;
 *  - SUSPENDED → état précédent (via « reprendre »).
 */
const MANUAL_TRANSITIONS: Partial<Record<OperationStatus, OperationStatus[]>> = {
  DRAFT: ["IN_REVIEW", "CANCELLED"],
  IN_REVIEW: ["DRAFT", "PUBLISHED", "CANCELLED"],
  PUBLISHED: ["FUNDING_OPEN", "CANCELLED"],
  FUNDING_OPEN: ["FUNDED", "CANCELLED"], // FUNDED manuel : l'entreprise complète le financement
  FUNDED: ["ACQUISITION", "CANCELLED"],
  ACQUISITION: ["REPAIR", "READY_FOR_SALE"],
  REPAIR: ["READY_FOR_SALE"],
  READY_FOR_SALE: ["ON_SALE"],
  ON_SALE: ["SOLD", "READY_FOR_SALE"],
  SOLD: ["CLOSING_PENDING"],
  CLOSED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
};

/** États depuis lesquels une suspension est possible (litige, conformité…). */
const SUSPENDABLE: OperationStatus[] = [
  "PUBLISHED",
  "FUNDING_OPEN",
  "FUNDED",
  "ACQUISITION",
  "REPAIR",
  "READY_FOR_SALE",
  "ON_SALE",
  "SOLD",
  "CLOSING_PENDING",
];

export function allowedManualTransitions(from: OperationStatus): OperationStatus[] {
  const next = [...(MANUAL_TRANSITIONS[from] ?? [])];
  if (SUSPENDABLE.includes(from)) next.push("SUSPENDED");
  return next;
}

export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
  return allowedManualTransitions(from).includes(to);
}

export const PUBLIC_STATUSES: OperationStatus[] = [
  "PUBLISHED",
  "FUNDING_OPEN",
  "FUNDED",
  "ACQUISITION",
  "REPAIR",
  "READY_FOR_SALE",
  "ON_SALE",
  "SOLD",
  "CLOSING_PENDING",
  "CLOSED",
  "ARCHIVED",
];

export function isInvestable(status: OperationStatus): boolean {
  return status === "FUNDING_OPEN";
}

/** Une opération est financièrement figée une fois clôturée (CDC §4). */
export function isFinanciallyLocked(status: OperationStatus): boolean {
  return status === "CLOSED" || status === "ARCHIVED" || status === "CANCELLED";
}

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export function statusTone(status: OperationStatus): StatusTone {
  switch (status) {
    case "FUNDING_OPEN":
      return "success";
    case "FUNDED":
    case "ACQUISITION":
    case "REPAIR":
    case "READY_FOR_SALE":
    case "ON_SALE":
      return "info";
    case "SOLD":
    case "CLOSING_PENDING":
      return "warning";
    case "SUSPENDED":
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}
