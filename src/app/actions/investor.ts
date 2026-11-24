"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { invest } from "@/lib/services/investment";
import { claimSettlement } from "@/lib/services/closure";
import { getSetting } from "@/lib/services/settings";
import { prisma } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { DomainError } from "@/lib/errors";

export async function investAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let done = false;
  const res = await runAction(async () => {
    const user = await requireUser();
    const amount = parseMoney(String(fd.get("amount") ?? ""));
    if (amount === null) throw new DomainError("INVALID", "Montant invalide.");
    await invest({
      userId: user.id,
      operationId: String(fd.get("operationId")),
      amount,
      idempotencyKey: String(fd.get("idempotencyKey")),
      riskAccepted: fd.get("riskAccepted") === "on",
      termsVersion: await getSetting("TERMS_VERSION"),
    });
    done = true;
  });
  if (done) {
    revalidatePath("/", "layout");
    redirect("/espace/investissements?confirme=1");
  }
  return res;
}

export async function claimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let done = false;
  const res = await runAction(async () => {
    const user = await requireUser();
    await claimSettlement(user.id, String(fd.get("settlementId")));
    done = true;
  });
  if (done) {
    revalidatePath("/espace", "layout");
    redirect("/espace/gains?credite=1");
  }
  return res;
}

export async function markNotificationsReadAction() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/espace");
}
