/**
 * Adaptador real da camada de IA usando Amazon Bedrock (Converse API).
 *
 * Implementa a interface `AIProvider`. A IA e SEMPRE assistiva: recepcao nao
 * clinica, PT-BR, sem PII alem do necessario. O guardrail clinico
 * (`requestsClinicalContent`) roda ANTES desta camada no ConversationService,
 * de modo que este adaptador nunca e chamado para conteudo clinico.
 *
 * Seguranca / LGPD:
 * - Nao logamos prompt nem resposta (podem conter dados do contato).
 * - Credenciais vem do ambiente de execucao (perfil IAM da task ECS / provider
 *   padrao do SDK), nunca hardcoded. Nada de chaves em codigo.
 *
 * O cliente Bedrock e injetavel para permitir teste com mock (sem chamada real,
 * sem custo). Ver `.kiro/steering/clinical-safety.md` e `security-lgpd.md`.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
  type Message as BedrockMessage,
} from "@aws-sdk/client-bedrock-runtime";

import type { TriageResult } from "../domain/models.js";
import type { AIProvider } from "./ai-provider.js";

/** Limite explicito de tokens de saida. Sempre definido (nunca implicito). */
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/** Regiao primaria do produto (dados no Brasil). */
export const DEFAULT_BEDROCK_REGION = "sa-east-1";

/**
 * Prompt de sistema que fixa o papel da IA de recepcao. Em PT-BR, assistivo,
 * nao clinico e com minimizacao de dados. Reforca o guardrail que ja roda antes.
 */
const RECEPTION_SYSTEM_PROMPT =
  "Voce e o atendimento virtual (IA) de uma clinica odontologica brasileira. " +
  "Fale sempre em portugues do Brasil, de forma cordial e objetiva. " +
  "Seu papel e assistivo: ajudar com informacoes gerais, agendamento e " +
  "orientacoes administrativas. Voce NAO fornece diagnostico, prescricao, " +
  "dosagem ou qualquer decisao clinica; nesses casos, oriente o contato de " +
  "forma acolhedora a falar com um profissional da clinica. " +
  "Nao invente informacoes especificas da clinica (precos, horarios, " +
  "profissionais) que voce nao recebeu. Nao solicite nem repita dados pessoais " +
  "sensiveis alem do estritamente necessario. Deixe claro, quando pertinente, " +
  "que voce e um atendimento por IA.";

/**
 * Prompt de sistema para triagem nao clinica. Pede uma saida estritamente em
 * JSON para parse deterministico. A triagem NAO e diagnostico: apenas classifica
 * o motivo do contato e uma urgencia percebida (nao clinica) para roteamento.
 */
const TRIAGE_SYSTEM_PROMPT =
  "Voce classifica mensagens recebidas na recepcao de uma clinica odontologica. " +
  "Isto NAO e triagem clinica nem diagnostico: apenas organiza o atendimento. " +
  "Responda EXCLUSIVAMENTE com um objeto JSON valido, sem texto antes ou depois, " +
  'no formato: {"reason": string, "perceivedUrgency": "low"|"medium"|"high", ' +
  '"recommendHandoff": boolean}. ' +
  "O campo reason resume em portugues o motivo do contato em ate 280 caracteres. " +
  "perceivedUrgency reflete a urgencia percebida no texto (nao e avaliacao " +
  "clinica). recommendHandoff deve ser true sempre que houver qualquer sinal de " +
  "urgencia, dor, sofrimento, pedido clinico ou duvida sobre encaminhar a um " +
  "profissional. Na duvida, use recommendHandoff true.";

export interface BedrockAIProviderOptions {
  /** Cliente Bedrock Runtime (injetavel para teste). */
  readonly client: BedrockRuntimeClient;
  /** Id do modelo (ou inference profile) a usar no Converse. */
  readonly modelId: string;
  readonly maxTokens?: number;
  readonly guardrailId?: string;
  readonly guardrailVersion?: string;
}

/** Cria um cliente Bedrock Runtime com retry adaptativo. */
export function createBedrockClient(region: string): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region,
    maxAttempts: 5,
    retryMode: "adaptive",
  });
}

/** Extrai o texto do primeiro bloco de conteudo da resposta do Converse. */
function extractText(output: ConverseCommandOutput): string {
  const content = output.output?.message?.content;
  if (!content || content.length === 0) {
    return "";
  }
  for (const block of content) {
    if (typeof block.text === "string" && block.text.trim().length > 0) {
      return block.text.trim();
    }
  }
  return "";
}

/** Fallback conservador de triagem: em qualquer duvida, recomenda handoff. */
function conservativeTriage(text: string): TriageResult {
  return {
    reason: text.slice(0, 280),
    perceivedUrgency: "medium",
    recommendHandoff: true,
  };
}

const VALID_URGENCY = new Set(["low", "medium", "high"]);

/** Faz parse defensivo do JSON de triagem; qualquer falha cai no fallback. */
function parseTriage(raw: string, originalText: string): TriageResult {
  const trimmed = raw.trim();
  // Isola o primeiro objeto JSON caso o modelo adicione texto ao redor.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return conservativeTriage(originalText);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return conservativeTriage(originalText);
  }

  if (typeof parsed !== "object" || parsed === null) {
    return conservativeTriage(originalText);
  }

  const record = parsed as Record<string, unknown>;
  const reason =
    typeof record.reason === "string" && record.reason.trim().length > 0
      ? record.reason.slice(0, 280)
      : originalText.slice(0, 280);
  const urgency =
    typeof record.perceivedUrgency === "string" &&
    VALID_URGENCY.has(record.perceivedUrgency)
      ? (record.perceivedUrgency as TriageResult["perceivedUrgency"])
      : "medium";
  // Handoff conservador: so nao recomenda se o modelo disser explicitamente false
  // E a urgencia nao for alta.
  const recommendHandoff =
    record.recommendHandoff === false && urgency !== "high" ? false : true;

  return { reason, perceivedUrgency: urgency, recommendHandoff };
}

/**
 * Provedor de IA baseado no Amazon Bedrock (Converse API). Nao faz nenhuma
 * chamada na construcao; cada metodo envia um comando isolado.
 */
export class BedrockAIProvider implements AIProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;
  private readonly maxTokens: number;
  private readonly guardrailConfig:
    | {
        readonly guardrailIdentifier: string;
        readonly guardrailVersion: string;
        readonly trace: "disabled";
      }
    | undefined;

  constructor(options: BedrockAIProviderOptions) {
    this.client = options.client;
    this.modelId = options.modelId;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    if (!Number.isInteger(this.maxTokens) || this.maxTokens < 1) {
      throw new Error("Bedrock maxTokens must be a positive integer.");
    }
    if (Boolean(options.guardrailId) !== Boolean(options.guardrailVersion)) {
      throw new Error("Bedrock guardrail ID and version must be configured together.");
    }
    this.guardrailConfig =
      options.guardrailId && options.guardrailVersion
        ? {
            guardrailIdentifier: options.guardrailId,
            guardrailVersion: options.guardrailVersion,
            trace: "disabled",
          }
        : undefined;
  }

  async reply(userMessage: string): Promise<string> {
    const messages: BedrockMessage[] = [
      { role: "user", content: [{ text: userMessage }] },
    ];
    const output = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: RECEPTION_SYSTEM_PROMPT }],
        messages,
        inferenceConfig: { maxTokens: this.maxTokens, temperature: 0.3 },
        guardrailConfig: this.guardrailConfig,
      }),
    );
    const text = extractText(output);
    if (text.length === 0) {
      // Resposta vazia do modelo: retorno assistivo seguro e generico.
      return (
        "Desculpe, nao consegui responder agora. Posso ajudar com informacoes " +
        "gerais e agendamento, ou encaminhar voce a um profissional da clinica."
      );
    }
    return text;
  }

  async triage(text: string): Promise<TriageResult> {
    try {
      const output = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: TRIAGE_SYSTEM_PROMPT }],
          messages: [{ role: "user", content: [{ text }] }],
          inferenceConfig: { maxTokens: this.maxTokens, temperature: 0 },
          guardrailConfig: this.guardrailConfig,
        }),
      );
      const raw = extractText(output);
      if (raw.length === 0) {
        return conservativeTriage(text);
      }
      return parseTriage(raw, text);
    } catch {
      // Falha na chamada: nao vaza detalhes; triagem conservadora.
      return conservativeTriage(text);
    }
  }
}
