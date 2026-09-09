/**
 * Camada de IA plugavel.
 *
 * O dominio depende apenas desta interface. Em producao, adaptadores concretos
 * (Bedrock, OpenAI, modelos privados) a implementam, com chaves resolvidas do
 * Secrets Manager em runtime. Em dev/teste, usamos o StubAIProvider
 * deterministico (sem chamada externa, sem custo, sem vazamento de dados).
 *
 * A IA e SEMPRE assistiva: nao decide clinicamente. Prompts devem minimizar
 * dados (sem PII alem do necessario).
 *
 * Ver `.kiro/specs/ai-front-desk/design.md` e `.kiro/steering/clinical-safety.md`.
 */

import type { TriageResult } from "../domain/models.js";

export interface AIProvider {
  /** Gera uma resposta assistiva de recepcao (nao clinica). */
  reply(userMessage: string): Promise<string>;
  /** Triagem nao clinica: motivo do contato e urgencia percebida. */
  triage(text: string): Promise<TriageResult>;
}

/** Palavras que sugerem urgencia (nao clinica) para recomendar handoff. */
const URGENCY_HINTS: readonly string[] = [
  "urgente",
  "emergencia",
  "muita dor",
  "sangramento",
  "agora",
  "socorro",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Provedor de IA stub, deterministico. Nao faz chamadas externas. Serve para
 * desenvolvimento e testes; a resposta e uma mensagem de recepcao padrao e a
 * triagem usa heuristica simples de urgencia.
 */
export class StubAIProvider implements AIProvider {
  async reply(_userMessage: string): Promise<string> {
    return (
      "Ola! Sou o atendimento virtual da clinica. Posso ajudar com informacoes " +
      "gerais e agendamento. Para questoes clinicas, um profissional dara " +
      "continuidade."
    );
  }

  async triage(text: string): Promise<TriageResult> {
    const normalized = normalize(text);
    const urgent = URGENCY_HINTS.some((hint) => normalized.includes(hint));
    return {
      reason: text.slice(0, 280),
      perceivedUrgency: urgent ? "high" : "low",
      recommendHandoff: urgent,
    };
  }
}
