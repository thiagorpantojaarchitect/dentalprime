# Design — ai-front-desk

## Visão geral

Serviço de domínio da recepção por IA. A IA é **assistiva**: conversa, faz
triagem não clínica e sugere agendamentos, mas nunca decide clinicamente nem
executa ações irreversíveis (agendar, registrar prontuário) por conta própria.
A camada de IA é abstraída por uma interface plugável. Depende de identity-access
(contexto e autorização).

Referências: `.kiro/steering/clinical-safety.md`, `.kiro/steering/security-lgpd.md`.

## Componentes

### AIProvider (interface)
- `reply(prompt)`: gera uma resposta assistiva.
- `triage(text)`: extrai motivo do contato e urgência percebida (não clínica).
- Implementacoes: `StubAIProvider` (deterministico, para dev/teste) e, em
  producao, adaptadores para Bedrock/OpenAI/privado (chaves via Secrets Manager).

### Guardrails
- Detecta pedidos de conteúdo clínico (diagnóstico/prescrição) e recusa,
  recomendando handoff.
- Marca toda saída de IA que possa influenciar cuidado como pendente de revisão
  humana em `ai_action_log`.

### ConversationService
- Inicia conversas; adiciona mensagens de usuário e de IA (com flag `isAI`);
  aplica guardrails à entrada antes de acionar o AIProvider.

### TriageService
- Usa o AIProvider para triagem não clínica; se detectar urgência, recomenda
  handoff.

### HandoffService
- Registra handoff (por contato, IA ou regra) e marca a conversa para humano.

### SchedulingSuggestionService
- Produz sugestões de agendamento (assistivas). Registra a sugestão em
  `ai_action_log`. Não cria/altera agendamentos — isso é feito pelo
  smart-scheduling após confirmação humana.

## Modelo de dados

Domínio ai-front-desk de `documentation/data-model.md`: `conversation`,
`message` (com `isAI`), `handoff`, `ai_action_log` (com status de revisão) e
`audit_log`. `tenant_id` obrigatório.

## Fluxos críticos

- **Mensagem do contato**: guardrail verifica conteúdo; se clínico, recusa +
  handoff; senão, AIProvider responde (mensagem marcada isAI).
- **Triagem**: extrai motivo/urgência; urgência → recomenda handoff.
- **Sugestão de agendamento**: registra em ai_action_log como pendente; nunca
  agenda.
- **Handoff**: registra motivo e marca conversa para humano.

## Segurança e conformidade

- IA sempre identificada (isAI). Nenhuma decisão clínica autônoma.
- Saída que influencia cuidado exige revisão humana (ai_action_log pendente).
- Minimização de dados nos prompts; sem vazamento a terceiros.
- Isolamento por tenant; RBAC (frontdesk:read / frontdesk:manage); auditoria.
- Chaves de IA no Secrets Manager.

## Estratégia de testes

- Mensagem de IA vem marcada isAI.
- Pedido de conteúdo clínico é recusado e recomenda handoff (guardrail).
- Sugestão de agendamento registra ai_action_log e NÃO agenda.
- Handoff marca a conversa para humano.
- Isolamento por tenant e autorização allow/deny.
