import { describe, it, expect } from "vitest";
import { isValidCpf, normalizeCpf } from "./cpf.js";

describe("isValidCpf", () => {
  it("aceita CPF valido com e sem mascara", () => {
    // CPF valido de teste (digitos verificadores corretos).
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejeita CPF com digito verificador errado", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });

  it("rejeita sequencias repetidas", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejeita tamanho invalido", () => {
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("normalizeCpf", () => {
  it("remove tudo que nao e digito", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
  });
});
