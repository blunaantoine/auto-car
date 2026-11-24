import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/lib/money";

describe("montants", () => {
  it("formate en FCFA avec séparateurs", () => expect(formatMoney(1500000n)).toBe("1 500 000 FCFA"));
  it("formate les négatifs", () => expect(formatMoney(-2500n)).toBe("−2 500 FCFA"));
  it("lit les saisies avec espaces", () => expect(parseMoney("1 500 000")).toBe(1500000n));
  it("refuse décimales et négatifs", () => {
    expect(parseMoney("12,5")).toBeNull();
    expect(parseMoney("-100")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});
