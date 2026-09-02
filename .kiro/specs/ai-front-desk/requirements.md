# Requisitos (stub de escopo) — ai-front-desk

> Stub de escopo. A spec completa será desenvolvida quando este módulo entrar no
> roadmap ativo. Prioridade: média. Este módulo lida com a camada de IA do
> produto e exige atenção reforçada a segurança clínica e LGPD.

## Introdução

O módulo ai-front-desk é a recepção por IA: atende o primeiro contato do
paciente, faz triagem inicial e apoia o agendamento. A IA é **assistiva e
identificada como IA**; nunca toma decisão clínica autônoma. Integra-se a
smart-scheduling (agendamento) e identity-access.

Referências: `documentation/PRD.md`, `.kiro/steering/clinical-safety.md`,
`.kiro/steering/security-lgpd.md`.

## Escopo

Incluído:
- Conversas de atendimento de primeiro contato.
- Triagem inicial não clínica (motivo do contato, urgência percebida).
- Agendamento assistido (sugestões que a recepção/paciente confirma).
- Transferência para humano (handoff) quando necessário.
- Registro de ações sugeridas/executadas pela IA.

Fora de escopo (fundação):
- Qualquer diagnóstico, prescrição ou decisão clínica pela IA.
- Registro clínico gerado por IA sem revisão humana.
- Escolha de fornecedor de IA fixa: a camada é plugável (Bedrock, OpenAI,
  modelos privados).

## Entidades

`conversation`, `message`, `handoff`, `ai_action_log` (ver
`documentation/data-model.md`).

## Restrições

- Multi-tenant por `tenant_id`.
- Conteúdo de IA identificado ao usuário como IA.
- Saída que possa influenciar cuidado exige revisão humana antes de virar
  registro clínico.
- Minimização de dados em prompts; sem vazamento a terceiros não autorizados.
- Chaves de fornecedores de IA no Secrets Manager, resolvidas em runtime.
- Confirmar o desenho de fluxos com o usuário antes de implementar (segurança
  clínica).

## Próximos passos

Detalhar requisitos EARS, design (incluindo guardrails de IA e critérios de
handoff) e tasks quando o módulo for priorizado.
