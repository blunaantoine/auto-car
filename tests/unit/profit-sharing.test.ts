import { describe, expect, it } from "vitest";
import { allocateProRata, computeDistribution, LossRuleNotConfiguredError } from "@/lib/domain/profit-sharing";

describe("partage du bénéfice — exemple du cahier des charges (§2.2/§2.3)", () => {
  const d = computeDistribution({
    netResult: 600_000n,
    companyContribution: 1_000_000n,
    investments: [
      { id: "a", amount: 300_000n },
      { id: "b", amount: 200_000n },
    ],
    lossRule: "UNSET",
  });

  it("part théorique de l'entreprise = 400 000", () => expect(d.companyTheoreticalShare).toBe(400_000n));
  it("part finale conservée = 200 000", () => expect(d.companyFinalShare).toBe(200_000n));
  it("enveloppe des particuliers = 400 000", () => expect(d.investorsEnvelope).toBe(400_000n));
  it("répartition au prorata des apports", () => {
    expect(d.investors).toEqual([
      { id: "a", capital: 300_000n, result: 240_000n, claimable: 540_000n },
      { id: "b", capital: 200_000n, result: 160_000n, claimable: 360_000n },
    ]);
  });
  it("conservation : part entreprise + enveloppe = B", () =>
    expect(d.companyFinalShare + d.investorsEnvelope).toBe(d.netResult));
});

describe("arrondis", () => {
  it("le plus fort reste garantit une somme exacte", () => {
    const parts = allocateProRata(100n, [1n, 1n, 1n]);
    expect(parts).toEqual([34n, 33n, 33n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100n);
  });

  it("la part entreprise est arrondie à l'inférieur (profite aux particuliers)", () => {
    // B×E/(2(E+P)) = 1000×1/(2×3) = 166,67 → 166
    const d = computeDistribution({
      netResult: 1000n,
      companyContribution: 1n,
      investments: [{ id: "x", amount: 2n }],
      lossRule: "UNSET",
    });
    expect(d.companyFinalShare).toBe(166n);
    expect(d.investorsEnvelope).toBe(834n);
  });

  it("propriété : somme des gains = enveloppe, pour des montants variés", () => {
    let seed = 42;
    const rnd = (max: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % max);
    for (let k = 0; k < 300; k++) {
      const investments = Array.from({ length: 1 + rnd(30) }, (_, i) => ({ id: `i${i}`, amount: BigInt(2500 + rnd(5_000_000)) }));
      const d = computeDistribution({
        netResult: BigInt(rnd(10_000_000)),
        companyContribution: BigInt(rnd(20_000_000)),
        investments,
        lossRule: "UNSET",
      });
      const sum = d.investors.reduce((a, i) => a + i.result, 0n);
      expect(sum).toBe(d.investorsEnvelope);
      expect(d.companyFinalShare + d.investorsEnvelope).toBe(d.netResult);
      for (const i of d.investors) expect(i.result).toBeGreaterThanOrEqual(0n);
    }
  });
});

describe("cas limites", () => {
  it("sans apport de l'entreprise, tout le bénéfice va aux particuliers", () => {
    const d = computeDistribution({ netResult: 90_000n, companyContribution: 0n, investments: [{ id: "a", amount: 10_000n }], lossRule: "UNSET" });
    expect(d.companyFinalShare).toBe(0n);
    expect(d.investors[0].result).toBe(90_000n);
  });

  it("sans particulier, l'entreprise conserve tout", () => {
    const d = computeDistribution({ netResult: 50_000n, companyContribution: 1_000_000n, investments: [], lossRule: "UNSET" });
    expect(d.companyFinalShare).toBe(50_000n);
    expect(d.investorsEnvelope).toBe(0n);
  });

  it("résultat nul : chacun récupère son capital", () => {
    const d = computeDistribution({ netResult: 0n, companyContribution: 100n, investments: [{ id: "a", amount: 50n }], lossRule: "UNSET" });
    expect(d.investors[0]).toMatchObject({ result: 0n, claimable: 50n });
  });
});

describe("pertes (§2.5)", () => {
  const base = { netResult: -300_000n, companyContribution: 1_000_000n, investments: [{ id: "a", amount: 300_000n }, { id: "b", amount: 200_000n }] };

  it("règle non approuvée : clôture déficitaire bloquée", () => {
    expect(() => computeDistribution({ ...base, lossRule: "UNSET" })).toThrow(LossRuleNotConfiguredError);
  });

  it("règle proportionnelle : 1/3 de la perte pour les particuliers", () => {
    const d = computeDistribution({ ...base, lossRule: "PROPORTIONAL" });
    expect(d.investorsEnvelope).toBe(-100_000n);
    expect(d.companyFinalShare).toBe(-200_000n);
    expect(d.investors.map((i) => i.result)).toEqual([-60_000n, -40_000n]);
    expect(d.investors.map((i) => i.claimable)).toEqual([240_000n, 160_000n]);
  });

  it("première perte entreprise : les particuliers ne perdent rien tant que la perte ≤ E", () => {
    const d = computeDistribution({ ...base, lossRule: "COMPANY_FIRST_LOSS" });
    expect(d.investorsEnvelope).toBe(0n);
    expect(d.companyFinalShare).toBe(-300_000n);
  });

  it("une perte ne dépasse jamais le capital investi", () => {
    const d = computeDistribution({ ...base, netResult: -5_000_000n, lossRule: "COMPANY_FIRST_LOSS" });
    expect(d.investors.map((i) => i.claimable)).toEqual([0n, 0n]);
  });
});
