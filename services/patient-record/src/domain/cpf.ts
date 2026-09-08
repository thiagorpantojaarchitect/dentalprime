/**
 * Validacao e normalizacao de CPF (Cadastro de Pessoa Fisica).
 *
 * Regras brasileiras oficiais: 11 digitos, com dois digitos verificadores
 * calculados por modulo 11. Rejeita sequencias repetidas (ex.: 11111111111).
 */

/** Remove tudo que nao for digito. */
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Valida um CPF. Aceita com ou sem mascara; valida os digitos verificadores.
 */
export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (cpf.length !== 11) return false;
  // Rejeita sequencias identicas (todas passam no calculo, mas sao invalidas).
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map((d) => Number.parseInt(d, 10));

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += digits[i]! * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}
