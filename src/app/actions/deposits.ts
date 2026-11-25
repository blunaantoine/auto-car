"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, str, type ActionState } from "@/lib/actions";
import { requireActor, requireUser } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { parseMoney } from "@/lib/money";
import { addExchangeRate, addPaymentMethod, createAgent, setPaymentMethodActive, updateAgent } from "@/lib/services/agents";
import {
  agentConfirmDeposit,
  agentRejectDeposit,
  cancelDeposit,
  disputeDeposit,
  financeRejectDeposit,
  financeValidateDeposit,
  submitDeposit,
} from "@/lib/services/deposits";
import { formObject, moneyField, optionalMoneyField } from "@/lib/validation";

// ─────────────────────────── Investisseur ───────────────────────────

export async function submitDepositAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let ok = false;
  const res = await runAction(async () => {
    const user = await requireUser();
    const amount = parseMoney(str(fd, "amount"));
    if (amount === null) throw new DomainError("INVALID", "Montant invalide.");
    if (fd.get("paid") !== "on") throw new DomainError("NOT_PAID", "Confirmez avoir effectué le transfert avant de déclarer le dépôt.");
    const proof = fd.get("proof");
    await submitDeposit({
      userId: user.id,
      methodId: str(fd, "methodId"),
      amountLocal: amount,
      payerReference: str(fd, "payerReference"),
      payerAccount: str(fd, "payerAccount") || null,
      proof: proof instanceof File && proof.size > 0 ? new Uint8Array(await proof.arrayBuffer()) : null,
    });
    ok = true;
  });
  if (ok) {
    revalidatePath("/espace", "layout");
    redirect("/espace/depot?declare=1");
  }
  return res;
}

export async function cancelDepositAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await cancelDeposit(user.id, str(fd, "depositId"));
    revalidatePath("/espace/depot");
    return "Demande annulée.";
  });
}

// ─────────────────────────── Agent ───────────────────────────

// Après traitement, la carte disparaît de la liste : on redirige avec un bandeau de résultat.
export async function agentConfirmAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let result: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireActor("agent.access");
    result = await agentConfirmDeposit(actor, str(fd, "depositId"), str(fd, "agentReference"), str(fd, "note"));
  });
  if (result) {
    revalidatePath("/agent");
    redirect(`/agent?resultat=${result === "CREDITED" ? "credite" : "a-valider"}`);
  }
  return res;
}

export async function agentRejectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let done = false;
  const res = await runAction(async () => {
    const actor = await requireActor("agent.access");
    await agentRejectDeposit(actor, str(fd, "depositId"), str(fd, "reason"));
    done = true;
  });
  if (done) {
    revalidatePath("/agent");
    redirect("/agent?resultat=rejete");
  }
  return res;
}

// ─────────────────────────── Finance ───────────────────────────

export async function financeDepositAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireActor("deposits.review");
    const id = str(fd, "depositId");
    const decision = str(fd, "decision");
    if (decision === "VALIDATE") await financeValidateDeposit(actor, id, str(fd, "note"));
    else if (decision === "REJECT") await financeRejectDeposit(actor, id, str(fd, "note"));
    else if (decision === "DISPUTE") await disputeDeposit(actor, id, str(fd, "note"));
    else throw new DomainError("INVALID", "Décision inconnue.");
    revalidatePath("/admin/depots");
    target = `/admin/depots?filtre=${str(fd, "filtre") || "a-valider"}&resultat=${decision.toLowerCase()}`;
  });
  if (target) redirect(target);
  return res;
}

// ─────────────────────────── Administration des agents ───────────────────────────

const agentSchema = z.object({
  displayName: z.string().trim().min(2, "Nom affiché requis").max(80),
  countryCode: z.string().length(2, "Pays requis"),
  city: z.string().trim().min(1, "Ville requise").max(80),
  zone: z.string().trim().max(120).optional().transform((v) => v || null),
  hours: z.string().trim().max(120).optional().transform((v) => v || null),
  instructions: z.string().trim().max(1000).optional().transform((v) => v || null),
  supportContact: z.string().trim().max(120).optional().transform((v) => v || null),
  canDeposit: z.string().optional().transform((v) => v === "on"),
  status: z.enum(["PENDING", "ACTIVE", "UNAVAILABLE", "SUSPENDED"]),
});

export async function createAgentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: string | null = null;
  let temp: string | null = null;
  const res = await runAction(async () => {
    const actor = await requireActor("agents.manage");
    const d = agentSchema.extend({
      email: z.string().trim().email("E-mail invalide"),
      firstName: z.string().trim().max(80).optional().transform((v) => v || "Agent"),
      lastName: z.string().trim().max(80).optional().transform((v) => v || ""),
    }).parse(formObject(fd));
    const r = await createAgent(actor, d);
    target = r.agentId;
    temp = r.tempPassword;
  });
  if (target) {
    if (temp) return { ok: `Agent créé. Mot de passe temporaire du compte : ${temp} — à transmettre par un canal sûr, il ne sera plus affiché. Ajoutez maintenant ses moyens de paiement : /admin/agents/${target}` };
    redirect(`/admin/agents/${target}`);
  }
  return res;
}

export async function updateAgentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("agents.manage");
    const id = str(fd, "agentId");
    await updateAgent(actor, id, agentSchema.parse(formObject(fd)), str(fd, "reason"));
    revalidatePath(`/admin/agents/${id}`);
    return "Agent mis à jour.";
  });
}

const methodSchema = z.object({
  provider: z.string().trim().min(2, "Opérateur requis").max(60),
  accountName: z.string().trim().min(2, "Nom du bénéficiaire requis").max(120),
  accountNumber: z.string().trim().min(3, "Numéro ou identifiant requis").max(120),
  currency: z.string().trim().toUpperCase(),
  minAmount: moneyField("Minimum"),
  maxAmount: optionalMoneyField("Maximum"),
  feeFixed: optionalMoneyField("Frais fixes").transform((v) => v ?? 0n),
  feePercent: z.string().trim().optional().transform((v, ctx) => {
    const n = Number((v || "0").replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n >= 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Frais en % invalides." });
      return z.NEVER;
    }
    return Math.round(n * 100);
  }),
  delay: z.string().trim().max(80).optional().transform((v) => v || null),
});

export async function addMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("agents.manage");
    const id = str(fd, "agentId");
    const { feePercent, ...m } = methodSchema.parse(formObject(fd));
    await addPaymentMethod(actor, id, { ...m, feeBps: feePercent });
    revalidatePath(`/admin/agents/${id}`);
    return "Moyen de paiement ajouté.";
  });
}

export async function toggleMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("agents.manage");
    await setPaymentMethodActive(actor, str(fd, "methodId"), str(fd, "active") === "true");
    revalidatePath(`/admin/agents/${str(fd, "agentId")}`);
    return "Moyen de paiement mis à jour.";
  });
}

export async function addRateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActor("rates.manage");
    await addExchangeRate(actor, { currency: str(fd, "currency"), rate: str(fd, "rate"), source: str(fd, "source") });
    revalidatePath("/admin/parametres");
    return "Taux enregistré. Il s'applique aux nouvelles demandes uniquement.";
  });
}
