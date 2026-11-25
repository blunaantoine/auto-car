// Calcul d'un dépôt par agent : frais en devise locale, conversion vers la devise de référence (XOF).
// Tout en entiers : le taux est manipulé comme un décimal à 8 chiffres (jamais de flottants).

const SCALE = 100_000_000n; // 8 décimales

/** "655.957" → 65595700000n (taux × 10^8). */
export function parseRate(rate: string): bigint {
  const m = rate.trim().match(/^(\d{1,12})(?:\.(\d{1,8}))?$/);
  if (!m) throw new Error(`Taux invalide : ${rate}`);
  const scaled = BigInt(m[1]) * SCALE + BigInt((m[2] ?? "").padEnd(8, "0"));
  if (scaled <= 0n) throw new Error("Le taux doit être positif.");
  return scaled;
}

export function formatRate(scaled: bigint): string {
  const int = scaled / SCALE;
  const frac = (scaled % SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int.toString();
}

export interface DepositQuote {
  amountLocal: bigint;
  feeLocal: bigint;
  netLocal: bigint;
  rate: string;
  amountCredited: bigint;
}

/**
 * Frais = fixe + proportionnel (arrondi à l'unité inférieure) ; montant crédité = (montant − frais) × taux,
 * arrondi à l'unité inférieure. Le taux et les frais sont figés au moment de la demande (CDC §16).
 */
export function quoteDeposit(amountLocal: bigint, feeFixed: bigint, feeBps: number, rate: string): DepositQuote {
  if (amountLocal <= 0n) throw new Error("Montant invalide.");
  const feeLocal = feeFixed + (amountLocal * BigInt(feeBps)) / 10_000n;
  const netLocal = amountLocal - feeLocal;
  const scaled = parseRate(rate);
  const amountCredited = netLocal > 0n ? (netLocal * scaled) / SCALE : 0n;
  return { amountLocal, feeLocal, netLocal, rate: formatRate(scaled), amountCredited };
}

/** Devises à parité fixe avec le FCFA de référence (XOF). */
export const FIXED_PARITY: Record<string, string> = { XOF: "1", XAF: "1" };

export const DEPOSIT_STATUS_LABELS = {
  AWAITING_AGENT: "En attente de vérification",
  CONFIRMED_BY_AGENT: "Confirmé par l'agent — validation en cours",
  CREDITED: "Crédité",
  REJECTED: "Rejeté",
  EXPIRED: "Expiré",
  CANCELLED: "Annulé",
  DISPUTED: "En litige",
} as const;

export const AGENT_STATUS_LABELS = {
  PENDING: "En vérification",
  ACTIVE: "Actif",
  UNAVAILABLE: "Indisponible",
  SUSPENDED: "Suspendu",
} as const;
