/**
 * Valores monetarios com precisao fixa.
 *
 * Dinheiro e representado como numero INTEIRO de centavos (ex.: R$ 12,34 = 1234).
 * Nunca usar ponto flutuante binario para dinheiro (evita erros de arredondamento).
 * A conversao de/para string decimal ("12.34") acontece nas bordas (API e banco).
 *
 * Ver `.kiro/specs/finance/design.md`.
 */

export type Cents = number;

/** Converte uma string decimal ("1200.00", "12.5", "800") em centavos inteiros. */
export function decimalToCents(value: string): Cents {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error(`Valor monetario invalido: ${value}`);
  }
  const [intPart, fracPartRaw = ""] = value.split(".");
  const fracPart = fracPartRaw.padEnd(2, "0");
  return Number.parseInt(intPart!, 10) * 100 + Number.parseInt(fracPart, 10);
}

/** Converte centavos inteiros em string decimal com duas casas ("1234" -> "12.34"). */
export function centsToDecimal(cents: Cents): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Centavos devem ser inteiros: ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const fracPart = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

/** Soma uma lista de valores em centavos. */
export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Divide um total em `n` parcelas iguais em centavos, distribuindo o resto de
 * forma que a soma das parcelas seja exatamente o total (sem perder centavos).
 * As primeiras parcelas recebem +1 centavo ate zerar o resto.
 */
export function splitCents(total: Cents, n: number): Cents[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Numero de parcelas deve ser inteiro positivo.");
  }
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1 : base));
}
