import type { ExpenseCategory, ExpenseStatus, LedgerTransactionType, SettlementStatus } from "@prisma/client";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  ACQUISITION: "Acquisition",
  TRANSPORT: "Transport",
  STORAGE: "Stockage",
  PARTS: "Pièces",
  LABOR: "Main-d'œuvre",
  ADMIN_FEES: "Frais administratifs",
  TAXES: "Taxes",
  SALE_FEES: "Frais de vente",
  COMMISSIONS: "Commissions",
  OTHER: "Divers / marge de sécurité",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
};

export const TX_TYPE_LABELS: Record<LedgerTransactionType, string> = {
  DEPOSIT: "Dépôt",
  WITHDRAWAL: "Retrait",
  INVESTMENT: "Investissement",
  REFUND: "Remboursement",
  CLOSURE_FUNDING: "Clôture",
  CLAIM: "Réclamation",
  ADJUSTMENT: "Ajustement",
  REVERSAL: "Écriture inverse",
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  PENDING_VALIDATION: "Clôture en validation",
  CLAIMABLE: "Réclamable",
  CLAIMED: "Crédité",
};

export const formatDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(d)) : "—";
export const formatDateTime = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d)) : "—";
