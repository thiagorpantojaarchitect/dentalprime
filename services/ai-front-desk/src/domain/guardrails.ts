/**
 * Guardrails de seguranca clinica para a recepcao por IA.
 *
 * Deteccao (heuristica, conservadora) de solicitacoes de conteudo clinico que a
 * IA NAO deve responder: diagnostico, prescricao, indicacao de medicamento,
 * conduta clinica. Ao detectar, o fluxo recusa e recomenda handoff para um
 * profissional. A heuristica prioriza seguranca (preferir recusar em duvida);
 * em producao pode ser reforcada por classificacao do proprio AIProvider.
 *
 * Ver `.kiro/steering/clinical-safety.md`.
 */

/** Termos que indicam pedido de conteudo clinico. Comparacao sem acento/caixa. */
const CLINICAL_TERMS: readonly string[] = [
  "diagnostico",
  "diagnosticar",
  "receita",
  "receitar",
  "prescricao",
  "prescrever",
  "prescreva",
  "remedio",
  "medicamento",
  "antibiotico",
  "dosagem",
  "posologia",
  "que doenca",
  "qual doenca",
  "e grave",
  "tratamento para",
  "o que tomar",
  "qual remedio",
];

/** Normaliza: minusculas e remocao de acentos, para casar termos com robustez. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Indica se o texto solicita conteudo clinico que a IA nao deve fornecer.
 */
export function requestsClinicalContent(text: string): boolean {
  const normalized = normalize(text);
  return CLINICAL_TERMS.some((term) => normalized.includes(term));
}
