// Règle de partage du résultat — cahier des charges §2.3 à §2.5.
//
// Variables : B = bénéfice net distribuable ; E = contribution de l'entreprise ;
// P = total des contributions des particuliers ; I = contribution d'un investisseur.
//
//   Part théorique de l'entreprise      = B × E / (E + P)
//   Part finale conservée par l'entreprise = B × E / (E + P) × 50 %
//   Enveloppe totale des particuliers   = B − part finale de l'entreprise
//   Gain d'un investisseur              = Enveloppe × I / P
//
// Arrondis (montants entiers) :
//   - la part finale de l'entreprise est arrondie à l'unité inférieure
//     (l'arrondi profite aux particuliers) ;
//   - l'enveloppe est répartie par la méthode du plus fort reste, de sorte que
//     la somme des gains individuels soit exactement égale à l'enveloppe.
//
// Pertes (§2.5) : la règle n'est pas encore contractualisée. Tant qu'elle vaut
// "UNSET", toute clôture déficitaire est bloquée (§18).

export const FORMULA_VERSION = "partage-v1 (CDC 1.2, §2.3)";

export const LOSS_RULES = ["UNSET", "PROPORTIONAL", "COMPANY_FIRST_LOSS"] as const;
export type LossRule = (typeof LOSS_RULES)[number];

export const LOSS_RULE_LABELS: Record<LossRule, string> = {
  UNSET: "Non définie — clôture déficitaire bloquée",
  PROPORTIONAL: "Répartition proportionnelle aux apports (entreprise et particuliers)",
  COMPANY_FIRST_LOSS:
    "Première perte absorbée par l'entreprise jusqu'à son apport, puis répartition entre particuliers",
};

export class LossRuleNotConfiguredError extends Error {
  constructor() {
    super(
      "La règle de traitement des pertes n'est pas approuvée : la clôture d'une opération déficitaire est bloquée.",
    );
    this.name = "LossRuleNotConfiguredError";
  }
}

export interface InvestmentShareInput {
  id: string;
  amount: bigint;
}

export interface InvestorResult {
  id: string;
  capital: bigint;
  /** gain (> 0) ou perte (< 0) */
  result: bigint;
  /** capital + result, jamais négatif */
  claimable: bigint;
}

export interface DistributionInput {
  netResult: bigint; // B
  companyContribution: bigint; // E
  investments: InvestmentShareInput[];
  lossRule: LossRule;
}

export interface Distribution {
  netResult: bigint;
  companyContribution: bigint;
  investorsTotal: bigint;
  companyTheoreticalShare: bigint;
  companyFinalShare: bigint;
  investorsEnvelope: bigint;
  investors: InvestorResult[];
}

/**
 * Répartit `total` (≥ 0) proportionnellement aux poids, par la méthode du plus fort reste.
 * Résultat déterministe : à reste égal, l'ordre d'entrée départage.
 */
export function allocateProRata(total: bigint, weights: bigint[]): bigint[] {
  if (total < 0n) throw new Error("allocateProRata : total négatif");
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (weights.some((w) => w < 0n)) throw new Error("allocateProRata : poids négatif");
  if (sum === 0n) {
    if (total !== 0n) throw new Error("allocateProRata : aucun poids pour répartir un montant non nul");
    return weights.map(() => 0n);
  }
  const base = weights.map((w) => (total * w) / sum);
  const remainders = weights.map((w, i) => ({ i, r: (total * w) % sum }));
  let left = total - base.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (left === 0n) break;
    base[i] += 1n;
    left -= 1n;
  }
  return base;
}

export function computeDistribution(input: DistributionInput): Distribution {
  const { netResult: B, companyContribution: E, investments, lossRule } = input;
  if (E < 0n) throw new Error("Contribution de l'entreprise négative");
  if (investments.some((i) => i.amount <= 0n)) throw new Error("Contribution d'investisseur invalide");

  const P = investments.reduce((a, i) => a + i.amount, 0n);
  const capitals = investments.map((i) => i.amount);
  const total = E + P;

  const build = (results: bigint[], theoretical: bigint, final: bigint): Distribution => ({
    netResult: B,
    companyContribution: E,
    investorsTotal: P,
    companyTheoreticalShare: theoretical,
    companyFinalShare: final,
    investorsEnvelope: results.reduce((a, b) => a + b, 0n),
    investors: investments.map((inv, idx) => ({
      id: inv.id,
      capital: inv.amount,
      result: results[idx],
      claimable: inv.amount + results[idx],
    })),
  });

  if (total === 0n) {
    if (B !== 0n) throw new Error("Résultat non nul sans aucun financement");
    return build([], 0n, 0n);
  }

  // ── Bénéfice (ou résultat nul)
  if (B >= 0n) {
    const theoretical = (B * E) / total;
    const final = P === 0n ? B : (B * E) / (2n * total);
    const envelope = B - final;
    const gains = P === 0n ? [] : allocateProRata(envelope, capitals);
    return build(gains, theoretical, final);
  }

  // ── Perte
  const loss = -B;
  switch (lossRule) {
    case "UNSET":
      throw new LossRuleNotConfiguredError();
    case "PROPORTIONAL": {
      // part des particuliers arrondie à l'inférieur, plafonnée à leur capital
      let investorsLoss = (loss * P) / total;
      if (investorsLoss > P) investorsLoss = P;
      const losses = allocateProRata(investorsLoss, capitals);
      const companyLoss = loss - investorsLoss;
      return build(
        losses.map((l) => -l),
        -((loss * E) / total),
        -companyLoss,
      );
    }
    case "COMPANY_FIRST_LOSS": {
      const companyLoss = loss <= E ? loss : E;
      let investorsLoss = loss - companyLoss;
      if (investorsLoss > P) investorsLoss = P;
      const losses = allocateProRata(investorsLoss, capitals);
      return build(
        losses.map((l) => -l),
        -((loss * E) / total),
        -companyLoss,
      );
    }
  }
}
