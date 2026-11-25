"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionState } from "@/lib/actions";
import { clearSessionCookie, getSessionToken, requestMeta, requireUser, setSessionCookie } from "@/lib/auth/session";
import { changeOwnPassword, issueCode, login, logout, logoutAll, register, verifyEmail } from "@/lib/services/auth";
import { DomainError } from "@/lib/errors";
import { formObject } from "@/lib/validation";

const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis").max(80),
  lastName: z.string().trim().min(1, "Nom requis").max(80),
  email: z.string().trim().email("Adresse e-mail invalide"),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(1, "Mot de passe requis"),
  passwordConfirm: z.string(),
  countryCode: z.string().length(2, "Choisissez votre pays"),
  city: z.string().trim().max(80).optional(),
  terms: z.literal("on", { errorMap: () => ({ message: "Vous devez accepter les conditions générales." }) }),
}).refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "Les mots de passe ne correspondent pas." });

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let done = false;
  const res = await runAction(async () => {
    const data = registerSchema.parse(formObject(fd));
    await register(data);
    const { token } = await login(data.email, data.password, await requestMeta());
    await setSessionCookie(token);
    done = true;
  });
  if (done) redirect("/verification");
  return res;
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: string | null = null;
  const res = await runAction(async () => {
    const { user, token } = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), await requestMeta());
    await setSessionCookie(token);
    const next = String(fd.get("next") ?? "");
    target = !user.emailVerifiedAt ? "/verification" : next.startsWith("/") && !next.startsWith("//") ? next : user.role === "INVESTOR" ? "/espace" : user.role === "AGENT" ? "/agent" : "/admin";
  });
  if (target) redirect(target);
  return res;
}

export async function verifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let done = false;
  const res = await runAction(async () => {
    const user = await requireUser();
    await verifyEmail(user.id, String(fd.get("code") ?? ""));
    done = true;
  });
  if (done) redirect("/espace?bienvenue=1");
  return res;
}

export async function resendCodeAction(_: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await issueCode(user.id, "EMAIL");
    return "Un nouveau code a été envoyé.";
  });
}

export async function logoutAction() {
  const token = await getSessionToken();
  if (token) await logout(token);
  await clearSessionCookie();
  redirect("/");
}

export async function logoutAllAction() {
  const user = await requireUser();
  await logoutAll(user.id);
  await clearSessionCookie();
  redirect("/connexion?deconnecte=1");
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const next = String(fd.get("next") ?? "");
    if (next !== String(fd.get("confirm") ?? "")) throw new DomainError("MISMATCH", "Les nouveaux mots de passe ne correspondent pas.");
    await changeOwnPassword(user.id, String(fd.get("current") ?? ""), next);
    return "Mot de passe modifié.";
  });
}
