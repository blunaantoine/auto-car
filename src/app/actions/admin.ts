"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ExpenseCategory, OperationStatus } from "@prisma/client";
import { runAction, str, type ActionState } from "@/lib/actions";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import { parseMoney } from "@/lib/money";
import { DomainError } from "@/lib/errors";
import {
  addExpense,
  createOperation,
  declareSale,
  publishUpdate,
  recordAcquisition,
  resumeOperation,
  reviewExpense,
  transitionOperation,
  updateOperation,
  editOperationDetails,
  correctOperationFinancials,
  type OperationInput,
} from "@/lib/services/operations";
import { discardClosureDraft, prepareClosure, validateClosure } from "@/lib/services/closure";
import { creditDeposit } from "@/lib/services/wallet";
import { adminResetPassword, markEmailVerified, setUserStatus, updateUserProfile } from "@/lib/services/auth";
import { updateSetting, type SettingKey } from "@/lib/services/settings";
import { audit } from "@/lib/services/audit";
import { dateField, formObject, moneyField, optionalMoneyField } from "@/lib/validation";

const BUDGET_CATEGORIES = ["ACQUISITION", "TRANSPORT", "PARTS", "LABOR", "ADMIN_FEES", "OTHER"] as const satisfies readonly ExpenseCategory[];

const operationSchema = z.object({
  title: z.string().trim().min(3, "Titre requis").max(120),
  description: z.string().trim().min(10, "Description requise"),
  risks: z.string().trim().min(10, "Les risques doivent être décrits"),
  make: z.string().trim().min(1, "Marque requise"),
  model: z.string().trim().min(1, "Modèle requis"),
  year: z.string().transform((v) => (v.trim() ? Number(v) : null)).refine((v) => v === null || (Number.isInteger(v) && v > 1950 && v < 2100), "Année invalide"),
  condition: z.string().trim().min(1, "État requis"),
  damageDescription: z.string().trim().min(1, "Dommages requis"),
  location: z.string().trim().min(1, "Localisation requise"),
  photos: z.string().optional().transform((v) => (v ?? "").split(/\s+/).filter((u) => /^https?:\/\//.test(u)).slice(0, 12)),
  companyContribution: moneyField("Contribution de l'entreprise"),
  investorTarget: moneyField("Montant recherché"),
  minInvestment: moneyField("Minimum"),
  maxPerInvestor: optionalMoneyField("Plafond"),
  estimatedDurationDays: z.string().transform((v) => (v.trim() ? Number(v) : null)).refine((v) => v === null || (Number.isInteger(v) && v > 0), "Durée invalide"),
});

function parseBudgetLines(fd: FormData) {
  const budgetLines = BUDGET_CATEGORIES.flatMap((category) => {
    const raw = str(fd, `budget_${category}`);
    if (!raw) return [];
    const amount = parseMoney(raw);
    if (amount === null) throw new DomainError("INVALID", `Budget « ${EXPENSE_CATEGORY_LABELS[category]} » invalide.`);
    return amount > 0n ? [{ category, label: EXPENSE_CATEGORY_LABELS[category], amount }] : [];
  });
  return { budgetLines };
}

function parseOperation(fd: FormData): OperationInput {
  const d = operationSchema.parse(formObject(fd));
  const budgetLines = BUDGET_CATEGORIES.flatMap((category) => {
    const raw = str(fd, `budget_${category}`);
    if (!raw) return [];
    const amount = parseMoney(raw);
    if (amount === null) throw new DomainError("INVALID", `Budget « ${EXPENSE_CATEGORY_LABELS[category]} » invalide.`);
    return amount > 0n ? [{ category, label: EXPENSE_CATEGORY_LABELS[category], amount }] : [];
  });
  return { ...d, acquisitionBudget: d.companyContribution + d.investorTarget, budgetLines };
}

export async function createOperationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireActor("operations.manage");
    id = (await createOperation(actor, parseOperation(fd))).id;
  });
  if (id) redirect(`/admin/operations/${id}`);
  return res;
}

export async function updateOperationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("operations.manage");
    const id = str(fd, "operationId");
    await updateOperation(actor, id, parseOperation(fd));
    revalidatePath(`/admin/operations/${id}`);
    return "Opération mise à jour.";
  });
}

export async function transitionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("operations.manage");
    const id = str(fd, "operationId");
    const to = str(fd, "to");
    if (to === "RESUME") await resumeOperation(actor, id, str(fd, "reason") || "Reprise");
    else await transitionOperation(actor, id, to as OperationStatus, str(fd, "reason") || undefined);
    revalidatePath(`/admin/operations/${id}`);
    return "État mis à jour.";
  });
}

export async function acquisitionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("operations.manage");
    const id = str(fd, "operationId");
    const d = z.object({ price: moneyField("Prix d'achat"), date: dateField }).parse(formObject(fd));
    await recordAcquisition(actor, id, d.price, d.date);
    revalidatePath(`/admin/operations/${id}`);
    return "Acquisition enregistrée. Pensez à saisir la dépense d'acquisition correspondante.";
  });
}

export async function saleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("operations.manage");
    const id = str(fd, "operationId");
    const d = z.object({ price: moneyField("Prix de vente"), date: dateField }).parse(formObject(fd));
    await declareSale(actor, id, d.price, d.date);
    revalidatePath(`/admin/operations/${id}`);
    return "Vente déclarée. La clôture financière peut être préparée.";
  });
}

const expenseSchema = z.object({
  category: z.enum(Object.keys(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, ...ExpenseCategory[]]),
  label: z.string().trim().min(1, "Libellé requis").max(200),
  amount: moneyField("Montant"),
  supplier: z.string().trim().max(120).optional(),
  documentRef: z.string().trim().max(300).optional(),
  incurredAt: dateField,
});

export async function addExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("expenses.record");
    const id = str(fd, "operationId");
    await addExpense(actor, id, expenseSchema.parse(formObject(fd)));
    revalidatePath(`/admin/operations/${id}`);
    return "Dépense enregistrée — en attente de validation par une autre personne.";
  });
}

export async function reviewExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("expenses.review");
    const decision = str(fd, "decision") === "APPROVED" ? "APPROVED" : "REJECTED";
    await reviewExpense(actor, str(fd, "expenseId"), decision, str(fd, "note") || undefined);
    revalidatePath(`/admin/operations/${str(fd, "operationId")}`);
    return decision === "APPROVED" ? "Dépense approuvée." : "Dépense rejetée.";
  });
}

export async function publishUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("operations.manage");
    const id = str(fd, "operationId");
    const d = z.object({ title: z.string().trim().min(3, "Titre requis").max(120), body: z.string().trim().min(5, "Texte requis").max(4000) }).parse(formObject(fd));
    await publishUpdate(actor, id, d.title, d.body);
    revalidatePath(`/admin/operations/${id}`);
    return "Mise à jour publiée aux investisseurs.";
  });
}

export async function prepareClosureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("closure.prepare");
    const id = str(fd, "operationId");
    await prepareClosure(actor, id);
    revalidatePath(`/admin/operations/${id}`);
    return "Brouillon de clôture calculé. Il doit être validé par un autre responsable financier.";
  });
}

export async function validateClosureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("closure.validate");
    const id = str(fd, "operationId");
    await validateClosure(actor, id);
    revalidatePath(`/admin/operations/${id}`);
    return "Clôture validée : les montants sont réclamables par les investisseurs.";
  });
}

export async function discardClosureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("closure.prepare");
    const id = str(fd, "operationId");
    await discardClosureDraft(actor, id, str(fd, "reason"));
    revalidatePath(`/admin/operations/${id}`);
    return "Brouillon de clôture annulé.";
  });
}

export async function creditDepositAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("wallet.credit");
    const userId = str(fd, "userId");
    const d = z.object({ amount: moneyField("Montant"), externalReference: z.string().trim().min(3, "Référence requise").max(100), reason: z.string().trim().min(3, "Motif requis").max(500) }).parse(formObject(fd));
    const tx = await creditDeposit(actor, { userId, ...d });
    revalidatePath(`/admin/utilisateurs/${userId}`);
    return `Dépôt crédité (transaction ${tx.reference}).`;
  });
}

export async function userStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("users.manage");
    const userId = str(fd, "userId");
    const status = str(fd, "status") === "ACTIVE" ? "ACTIVE" : "SUSPENDED";
    await setUserStatus(actor, userId, status, str(fd, "reason"));
    revalidatePath(`/admin/utilisateurs/${userId}`);
    return status === "ACTIVE" ? "Compte réactivé." : "Compte suspendu.";
  });
}

export async function userRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("roles.manage");
    const userId = str(fd, "userId");
    const role = z.enum(["INVESTOR", "ADMIN", "FINANCE", "SUPER_ADMIN"]).parse(str(fd, "role"));
    const reason = str(fd, "reason");
    if (!reason) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
    if (userId === actor.id) throw new DomainError("SELF", "Vous ne pouvez pas modifier votre propre rôle.");
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.user.update({ where: { id: userId }, data: { role } });
      await tx.session.deleteMany({ where: { userId } });
      await audit(tx, actor, { action: "user.role", entityType: "User", entityId: userId, before: { role: u.role }, after: { role }, reason });
    });
    revalidatePath(`/admin/utilisateurs/${userId}`);
    return "Rôle mis à jour (les sessions de l'utilisateur ont été fermées).";
  });
}

export async function settingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("settings.manage");
    await updateSetting(actor, str(fd, "key") as SettingKey, str(fd, "value"), str(fd, "reason"));
    revalidatePath("/admin/parametres");
    return "Paramètre enregistré.";
  });
}

export async function countryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("countries.manage");
    const d = z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Code ISO à 2 lettres"),
      name: z.string().trim().min(2, "Nom requis"),
      flag: z.string().trim().min(1, "Drapeau requis").max(8),
      dialCode: z.string().trim().regex(/^\+\d{1,4}$/, "Indicatif du type +228"),
      currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Code devise ISO à 3 lettres"),
      timezone: z.string().trim().min(3, "Fuseau requis"),
      active: z.string().optional().transform((v) => v === "on"),
    }).parse(formObject(fd));
    await prisma.$transaction(async (tx) => {
      const before = await tx.country.findUnique({ where: { code: d.code } });
      await tx.country.upsert({ where: { code: d.code }, update: d, create: d });
      await audit(tx, actor, { action: before ? "country.update" : "country.create", entityType: "Country", entityId: d.code, before, after: d });
    });
    revalidatePath("/admin/parametres");
    return "Pays enregistré.";
  });
}

// ─────────────────────────── Corrections d'opération ───────────────────────────

const detailsSchema = operationSchema.pick({
  title: true, description: true, risks: true, make: true, model: true, year: true,
  condition: true, damageDescription: true, location: true, photos: true, estimatedDurationDays: true,
});

export async function editDetailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("operations.manage");
    const id = str(fd, "operationId");
    await editOperationDetails(actor, id, detailsSchema.parse(formObject(fd)), str(fd, "reason"));
    revalidatePath(`/admin/operations/${id}`);
    return "Fiche corrigée. Les investisseurs de l'opération ont été prévenus.";
  });
}

const financialsSchema = operationSchema.pick({ companyContribution: true, investorTarget: true, minInvestment: true, maxPerInvestor: true });

export async function correctFinancialsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("operations.correct");
    const id = str(fd, "operationId");
    const d = financialsSchema.parse(formObject(fd));
    const { budgetLines } = parseBudgetLines(fd);
    await correctOperationFinancials(actor, id, { ...d, budgetLines }, str(fd, "reason"));
    revalidatePath(`/admin/operations/${id}`);
    return "Montants corrigés. La correction est journalisée et les investisseurs ont été prévenus.";
  });
}

// ─────────────────────────── Gestion des comptes ───────────────────────────

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(80),
  lastName: z.string().trim().min(1, "Nom requis").max(80),
  email: z.string().trim().email("Adresse e-mail invalide"),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
  countryCode: z.string().length(2, "Pays requis"),
  city: z.string().trim().max(80).optional().transform((v) => v || null),
});

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("users.manage");
    const userId = str(fd, "userId");
    await updateUserProfile(actor, userId, profileSchema.parse(formObject(fd)), str(fd, "reason"));
    revalidatePath(`/admin/utilisateurs/${userId}`);
    return "Profil mis à jour.";
  });
}

export async function verifyUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("users.manage");
    const userId = str(fd, "userId");
    await markEmailVerified(actor, userId, str(fd, "reason"));
    revalidatePath(`/admin/utilisateurs/${userId}`);
    return "Compte vérifié et activé.";
  });
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("staff.manage");
    const temp = await adminResetPassword(actor, str(fd, "userId"), str(fd, "reason"));
    return `Mot de passe temporaire : ${temp} — communiquez-le à l'utilisateur par un canal sûr. Il ne sera plus affiché.`;
  });
}
