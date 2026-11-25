import { describe, expect, it } from "vitest";
import { formatRate, parseRate, quoteDeposit } from "@/lib/domain/deposit";

describe("calcul d'un dépôt", () => {
  it("FCFA sans frais : crédité à l'identique", () => {
    expect(quoteDeposit(50_000n, 0n, 0, "1")).toMatchObject({ feeLocal: 0n, amountCredited: 50_000n });
  });
  it("frais fixes + proportionnels déduits avant conversion", () => {
    // 100 000 − (100 + 1 % = 1 100) = 98 900
    expect(quoteDeposit(100_000n, 100n, 100, "1")).toMatchObject({ feeLocal: 1_100n, netLocal: 98_900n, amountCredited: 98_900n });
  });
  it("conversion d'une autre devise, arrondie à l'inférieur", () => {
    // 150 EUR × 655,957 = 98 393,55 → 98 393
    expect(quoteDeposit(150n, 0n, 0, "655.957").amountCredited).toBe(98_393n);
    // 500 GHS × 52,3456789 = 26 172,83945 → 26 172
    expect(quoteDeposit(500n, 0n, 0, "52.3456789").amountCredited).toBe(26_172n);
  });
  it("taux stockés et relus sans perte", () => {
    expect(formatRate(parseRate("655.957"))).toBe("655.957");
    expect(formatRate(parseRate("1"))).toBe("1");
    expect(() => parseRate("-2")).toThrow();
    expect(() => parseRate("abc")).toThrow();
    expect(() => parseRate("0")).toThrow();
  });
});
