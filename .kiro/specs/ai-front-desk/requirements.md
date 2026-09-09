# Requisitos — ai-front-desk

## Introdução

O módulo ai-front-desk é a recepção por IA: atende o primeiro contato, faz
triagem inicial não clínica e apoia o agendamento. A IA é **assistiva e
identificada como IA**; nunca toma decisão clínica autônoma e nunca agenda ou
registra conteúdo clínico sem confirmação humana. A camada de IA é plugável
(Bedrock, OpenAI, modelos privados) por meio de uma interface.

Referências: `documentation/PRD.md`, `.kiro/steering/clinical-safety.md`,
`.kiro/steering/security-lgpd.md`.

## Requisitos

### Requisito 1 — Conversas de atendimento

**História:** Como paciente/contato, quero conversar com a recepção por IA, para
resolver meu primeiro contato.

**Critérios de aceitação:**
1. QUANDO uma conversa é iniciada ENTÃO o sistema DEVE associá-la ao `tenant_id`
   e registrar o canal.
2. QUANDO a IA responde ENTÃO a mensagem DEVE ser identificada como gerada por
   IA (flag `isAI`).
3. O sistema DEVE listar as mensagens de uma conversa em ordem cronológica.

### Requisito 2 — Triagem não clínica

**História:** Como recepção, quero uma triagem inicial do motivo do contato,
para direcionar o atendimento.

**Critérios de aceitação:**
1. A triagem DEVE capturar motivo do contato e urgência percebida (não clínica).
2. O sistema NÃO DEVE produzir diagnóstico, prescrição ou conclusão clínica.
3. SE o conteúdo indicar risco/urgência ENTÃO o sistema DEVE recomendar handoff
   para humano.

### Requisito 3 — Agendamento assistido

**História:** Como paciente, quero que a IA sugira horários, para facilitar o
agendamento.

**Critérios de aceitação:**
1. A IA DEVE apenas SUGERIR opções de agendamento; a confirmação é humana.
2. O sistema NÃO DEVE criar, alterar ou cancelar agendamentos automaticamente.
3. Cada sugestão DEVE ser registrada em `ai_action_log`.

### Requisito 4 — Handoff para humano

**História:** Como paciente, quero falar com um humano quando necessário, para
não ficar preso na IA.

**Critérios de aceitação:**
1. QUANDO um handoff é solicitado (pelo contato, pela IA ou por regra) ENTÃO o
   sistema DEVE registrar o handoff e o motivo.
2. QUANDO há handoff pendente ENTÃO a conversa DEVE ser marcada para atendimento
   humano.

### Requisito 5 — Guardrails de segurança clínica

**História:** Como responsável clínico, quero garantir que a IA não substitua o
julgamento clínico.

**Critérios de aceitação:**
1. Ações da IA que possam influenciar cuidado DEVEM ser registradas em
   `ai_action_log` com status pendente de revisão humana.
2. O sistema NÃO DEVE persistir saída de IA como registro clínico sem revisão
   humana explícita.
3. SE a IA detectar solicitação de conteúdo clínico (diagnóstico/prescrição)
   ENTÃO o sistema DEVE recusar e recomendar handoff.

### Requisito 6 — IA plugável e segurança de dados

**História:** Como arquiteto, quero trocar o fornecedor de IA sem reescrever o
domínio, e proteger os dados.

**Critérios de aceitação:**
1. A integração de IA DEVE ser feita por uma interface (`AIProvider`); o
   fornecedor concreto é injetado.
2. Prompts DEVEM minimizar dados (sem PII além do necessário).
3. Chaves de fornecedores DEVEM vir do Secrets Manager, resolvidas em runtime.
4. Toda consulta DEVE ser isolada por `tenant_id`; ações respeitam RBAC e são
   auditadas.
