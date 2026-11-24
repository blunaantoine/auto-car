import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { DomainError } from "./errors";

export type ActionState = { error?: string; ok?: string; fieldErrors?: Record<string, string> } | null;

/** Exécute une action serveur et convertit les erreurs métier en message affichable. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return { ok: ok ?? "Enregistré." };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { error: "Veuillez corriger les champs indiqués.", fieldErrors };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { error: "Cette opération a déjà été enregistrée." };
    // les redirections Next.js doivent remonter
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { error: "Une erreur inattendue est survenue. Réessayez ou contactez l'assistance." };
  }
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
