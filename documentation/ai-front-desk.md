# IA do Produto — Recepção por IA (ai-front-desk)

A camada de IA do produto é **assistiva** e **plugável**. Ela apoia a recepção
(informações gerais, agendamento, orientações administrativas) e **não toma
decisão clínica**. Isto é distinto da IA de desenvolvimento (Kiro/Codex), que
produz código e nunca acessa dados reais de pacientes.

Referências: `.kiro/steering/clinical-safety.md`,
`.kiro/steering/security-lgpd.md`, `.kiro/steering/product-vision.md`.

## Provedores plugáveis

O domínio depende apenas da interface `AIProvider`
(`src/application/ai-provider.ts`), com dois métodos:

- `reply(userMessage)` — resposta assistiva de recepção (não clínica).
- `triage(text)` — classificação não clínica do motivo do contato e urgência
  percebida, para roteamento.

Implementações disponíveis:

| Provedor | Classe | Uso |
|---|---|---|
| `stub` | `StubAIProvider` | Desenvolvimento e teste. Determinístico, sem chamada externa, sem custo. |
| `bedrock` | `BedrockAIProvider` | Produção. Amazon Bedrock via **Converse API**. |

A seleção é feita pela fábrica `createAIProvider(config)`
(`src/application/ai-provider-factory.ts`), a partir de `AI_PROVIDER`, que é
obrigatório. `stub` só é aceito quando `DEPLOYMENT_ENV=development`. Se Bedrock
for selecionado sem modelo ou a configuração estiver incompleta, o serviço
falha fechado; nunca muda silenciosamente para outro provedor.

## Adaptador Bedrock

`BedrockAIProvider` usa `@aws-sdk/client-bedrock-runtime` (Converse API):

- **Cliente injetável** (`BedrockRuntimeClient`), o que permite testar com um
  mock de `send` — os testes não fazem nenhuma chamada real à AWS.
- **`maxTokens` sempre explícito** (1024). `temperature` baixa na resposta e 0 na
  triagem (saída mais estável).
- **Retry adaptativo** (`maxAttempts: 5`, `retryMode: "adaptive"`).
- **Prompt de sistema em PT-BR** que fixa o papel: recepção assistiva, não
  clínica, sem solicitar/repetir PII além do necessário, sem inventar dados da
  clínica.
- **`triage`** pede saída estritamente em JSON e faz parse defensivo; em qualquer
  falha (parse inválido, resposta vazia, erro de rede) cai em um **fallback
  conservador** que recomenda handoff para um profissional. Urgência alta força
  handoff mesmo que o modelo diga o contrário.

Configuração (variáveis de ambiente; ver `.env.example`):

- `AI_PROVIDER` — `stub` ou `bedrock` (obrigatório; sem padrão implícito).
- `DEPLOYMENT_ENV` — `development`, `staging` ou `production`; somente o
  primeiro aceita `stub`.
- `BEDROCK_REGION` — padrão `sa-east-1` (dados no Brasil).
- `BEDROCK_MODEL_ID` — id do modelo ou inference profile (obrigatório para
  `bedrock`).
- `BEDROCK_GUARDRAIL_ID` e `BEDROCK_GUARDRAIL_VERSION` — opcionais tecnicamente,
  mas obrigatórios antes de autorizar uso clínico real; devem ser informados em
  conjunto.

## Guardrail de segurança clínica (antes da IA)

O guardrail `requestsClinicalContent` (`src/domain/guardrails.ts`) roda **antes**
de qualquer provedor em `ConversationService.handleContactMessage`. Quando o
contato pede conteúdo clínico (diagnóstico, prescrição, dosagem):

1. A IA **não** responde clinicamente.
2. Registra-se uma mensagem de recusa (identificada como IA).
3. Cria-se um **handoff** para um profissional e a conversa vai a `handoff`.
4. Registra-se auditoria (`conversation.clinical_content_blocked`).

Trocar o provedor de IA não altera esse comportamento: o guardrail é
independente do adaptador.

## Segredos e credenciais (LGPD)

- Nenhuma chave de IA em código, imagem de container ou variável plana. Em
  produção, as credenciais vêm do **perfil IAM da task (ECS)** ou do provider
  padrão do SDK; segredos adicionais são resolvidos do **AWS Secrets Manager em
  runtime**.
- **Não logamos** prompt nem resposta (podem conter dados do contato). Falhas
  registram apenas o nome do erro, sem detalhes sensíveis.

## Testes

- `bedrock-ai-provider.test.ts` — mock de `client.send`: `reply` extrai o texto;
  `triage` parseia JSON, isola JSON com texto ao redor, e cai no fallback
  conservador em parse inválido / erro; verifica `maxTokens`, `temperature` e a
  presença do system prompt não clínico. Nenhuma chamada real.
- `ai-provider-factory.test.ts` — stub somente quando declarado em development,
  Bedrock quando configurado com modelId e falha fechada quando falta modelId.
