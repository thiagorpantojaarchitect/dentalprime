import { describe, it, expect } from "vitest";
import { centsToDecimal, decimalToCents, splitCents, sumCents } from "./money.js";

describe("decimalToCents / centsToDecimal", () => {
  it("converte decimal para centavos", () => {
    expect(decimalToCents("12.34")).toBe(1234);
    expect(decimalToCents("800")).toBe(80000);
    expect(decimalToCents("0.5")).toBe(50);
  });

  it("converte centavos para decimal com duas casas", () => {
    expect(centsToDecimal(1234)).toBe("12.34");
    expect(centsToDecimal(80000)).toBe("800.00");
    expect(centsToDecimal(5)).toBe("0.05");
  });

  it("ida e volta preserva o valor", () => {
    for (const v of ["0.00", "1.00", "999.99", "1234.56"]) {
      expect(centsToDecimal(decimalToCents(v))).toBe(v);
    }
  });

  it("rejeita formato invalido", () => {
    expect(() => decimalToCents("12.999")).toThrow();
    expect(() => decimalToCents("abc")).toThrow();
  });
});

describe("splitCents", () => {
  it("divide igualmente quando divisivel", () => {
    expect(splitCents(1000, 4)).toEqual([250, 250, 250, 250]);
  });

  it("distribui o resto nas primeiras parcelas e soma exata", () => {
    const parts = splitCents(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(sumCents(parts)).toBe(1000);
  });

  it("caso classico 100 / 3", () => {
    const parts = splitCents(100, 3);
    expect(sumCents(parts)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });
});
