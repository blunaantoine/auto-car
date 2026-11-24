import { z } from "zod";
import { parseMoney } from "./money";

export const moneyField = (label: string) =>
  z.string().transform((v, ctx) => {
    const n = parseMoney(v);
    if (n === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} : montant entier attendu.` });
      return z.NEVER;
    }
    return n;
  });

export const optionalMoneyField = (label: string) =>
  z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const n = parseMoney(v);
    if (n === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} : montant entier attendu.` });
      return z.NEVER;
    }
    return n;
  });

export const dateField = z.string().transform((v, ctx) => {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide." });
    return z.NEVER;
  }
  return d;
});

export const formObject = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
