import { describe, expect, it } from "vitest";
import { canTransition, allowedManualTransitions } from "@/lib/domain/operation-status";

describe("transitions d'état d'une opération", () => {
  it("suit le cycle nominal", () => {
    expect(canTransition("DRAFT", "IN_REVIEW")).toBe(true);
    expect(canTransition("IN_REVIEW", "PUBLISHED")).toBe(true);
    expect(canTransition("PUBLISHED", "FUNDING_OPEN")).toBe(true);
    expect(canTransition("FUNDED", "ACQUISITION")).toBe(true);
    expect(canTransition("ON_SALE", "SOLD")).toBe(true);
  });
  it("une opération clôturée ne peut pas être rouverte", () => {
    expect(allowedManualTransitions("CLOSED")).toEqual(["ARCHIVED"]);
    expect(canTransition("CLOSED", "SUSPENDED")).toBe(false);
  });
  it("la clôture ne se fait jamais manuellement", () => {
    expect(canTransition("CLOSING_PENDING", "CLOSED")).toBe(false);
  });
  it("pas d'annulation après l'acquisition", () => {
    expect(canTransition("ACQUISITION", "CANCELLED")).toBe(false);
    expect(canTransition("FUNDED", "CANCELLED")).toBe(true);
  });
});
