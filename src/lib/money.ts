// Montants : entiers BigInt dans la plus petite unité de la devise de référence.
// Le FCFA (XOF/XAF) n'a pas de subdivision : 1 unité = 1 FCFA.

export const REFERENCE_CURRENCY = "XOF";
export const CURRENCY_LABEL = "FCFA";

export function formatMoney(amount: bigint | number | string, label = CURRENCY_LABEL): string {
  const value = BigInt(amount);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  // séparateur de milliers : espace insécable fine (usage français)
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "−" : ""}${grouped} ${label}`;
}

export function formatSigned(amount: bigint, label = CURRENCY_LABEL): string {
  return amount > 0n ? `+${formatMoney(amount, label)}` : formatMoney(amount, label);
}

/** Lit une saisie utilisateur (« 1 500 000 », « 1500000 ») en BigInt. Refuse décimales et signes. */
export function parseMoney(input: string): bigint | null {
  const cleaned = input.replace(/[\s  .]/g, "");
  if (!/^\d{1,15}$/.test(cleaned)) return null;
  return BigInt(cleaned);
}

export function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function percent(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((part * 10000n) / total) / 100;
}
