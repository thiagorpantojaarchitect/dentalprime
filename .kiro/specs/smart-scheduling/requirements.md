# Requisitos — smart-scheduling

## Introdução

O módulo smart-scheduling gerencia a agenda da clínica: disponibilidade de
profissionais e recursos, agendamentos, confirmações e lembretes, lista de
espera e otimização de encaixe. Busca reduzir faltas e maximizar a ocupação sem
comprometer a experiência do paciente. Depende de identity-access.

Referências: `.kiro/steering/architecture.md`, `documentation/data-model.md`.

## Requisitos

### Requisito 1 — Disponibilidade

**História:** Como recepcionista, quero configurar a disponibilidade de
profissionais e recursos, para agendar dentro das janelas corretas.

**Critérios de aceitação:**
1. O sistema DEVE permitir definir janelas de disponibilidade por provider,
   recurso e unidade, escopadas por `tenant_id`.
2. O sistema DEVE considerar horário de funcionamento, bloqueios e feriados.
3. SE não houver disponibilidade ENTÃO o sistema NÃO DEVE permitir agendamento
   naquele horário.

### Requisito 2 — Agendamento

**História:** Como recepcionista, quero agendar, reagendar e cancelar consultas,
para organizar a agenda.

**Critérios de aceitação:**
1. QUANDO um agendamento é criado ENTÃO o sistema DEVE verificar conflito de
   horário para provider e recurso.
2. SE houver conflito ENTÃO o sistema DEVE impedir, salvo política de overbooking
   explicitamente configurada.
3. QUANDO um agendamento é criado/alterado/cancelado ENTÃO o sistema DEVE
   publicar o evento correspondente.

### Requisito 3 — Confirmações e lembretes

**História:** Como clínica, quero enviar lembretes e confirmações, para reduzir
faltas.

**Critérios de aceitação:**
1. O sistema DEVE enviar lembretes/confirmações pelos canais configurados,
   respeitando o consentimento de contato do paciente.
2. QUANDO um lembrete é enviado ENTÃO o sistema DEVE registrar o resultado.
3. SE o envio falhar ENTÃO o sistema DEVE reprocessar de forma assíncrona (fila
   com DLQ).

### Requisito 4 — Status do agendamento

**História:** Como gerente, quero acompanhar o status das consultas, para medir
faltas e ocupação.

**Critérios de aceitação:**
1. O sistema DEVE suportar status: marcado, confirmado, atendido, faltou,
   cancelado.
2. QUANDO o status muda ENTÃO o sistema DEVE registrar o histórico com autoria e
   data/hora.

### Requisito 5 — Lista de espera e encaixe

**História:** Como recepcionista, quero preencher horários liberados
rapidamente, para manter a agenda cheia.

**Critérios de aceitação:**
1. O sistema DEVE permitir registrar pacientes em lista de espera.
2. QUANDO um horário é liberado ENTÃO o sistema DEVE sugerir candidatos da lista
   de espera.
3. As sugestões DEVEM ser assistivas; a confirmação do encaixe é humana.

### Requisito 6 — Isolamento e segurança

**História:** Como operador, quero que a agenda de cada clínica seja isolada,
para proteger a privacidade.

**Critérios de aceitação:**
1. Toda consulta de agenda DEVE ser filtrada por `tenant_id` e unidade.
2. O acesso à agenda DEVE respeitar RBAC e ser auditado.
3. Segredos de canais de notificação DEVEM vir do Secrets Manager.
