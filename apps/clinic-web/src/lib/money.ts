/**
 * Utilitarios de dinheiro para o frontend.
 *
 * O finance recebe valores como decimal-string ("120.00") e responde em
 * centavos inteiros. Aqui formatamos centavos para exibicao em BRL e validamos
 * a entrada decimal antes de enviar.
 */

/** Formata centavos inteiros como moeda BRL (ex.: 12000 -> "R$ 120,00"). */
export function formatCents(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Regex do backend para valor monetario decimal-string. */
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/** Valida se uma string e um valor monetario aceito pelo backend. */
export function isValidMoney(value: string): boolean {
  return MONEY_RE.test(value.trim());
}
