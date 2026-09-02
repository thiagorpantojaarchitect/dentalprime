# Design — smart-scheduling

## Visão geral

Serviço de domínio para a agenda da clínica: disponibilidade, agendamento,
confirmações/lembretes, lista de espera e otimização de encaixe. Depende de
identity-access (contexto e autorização) e integra-se a patient-record (paciente)
e finance (cobrança de consulta) por eventos.

Referências: `documentation/data-model.md`, `.kiro/steering/architecture.md`.

## Componentes

### AvailabilityService
- Janelas de disponibilidade por provider, recurso e unidade.
- Considera horário de funcionamento, bloqueios e feriados.

### SchedulingService
- Cria, reagenda e cancela agendamentos com verificação de conflito.
- Impede overbooking, salvo política explícita configurada pela clínica.

### StatusService
- Gerencia transições de status e mantém histórico auditável.

### ReminderService
- Dispara lembretes/confirmações por canais configurados; registra resultado.
- Respeita consentimento de contato do paciente. Operação assíncrona.

### WaitlistService
- Mantém lista de espera e sugere encaixes ao liberar horários. Sugestões são
  assistivas; a confirmação é humana.

## Modelo de dados

Domínio smart-scheduling de `documentation/data-model.md`: `provider`,
`resource`, `availability`, `appointment`, `appointment_status_history`,
`waitlist_entry`, `reminder`. `tenant_id` e unidade obrigatórios; índices por
data e provider.

## Fluxos críticos

- **Agendar**: valida disponibilidade e conflito; cria appointment; publica
  `AppointmentBooked`.
- **Confirmar/Lembrar**: envia lembrete, registra resultado, atualiza status.
- **Cancelar/Faltar**: registra status no histórico; aciona lista de espera.
- **Encaixe**: ao liberar horário, sugere candidatos da waitlist (assistivo).

## Integração por eventos

Publica em EventBridge: `AppointmentBooked`, `AppointmentConfirmed`,
`AppointmentCancelled`, `AppointmentNoShow`. Consome eventos de identidade e
paciente conforme necessário. Contratos versionados.

## Segurança

- Filtro por tenant/unidade em toda consulta de agenda.
- Autorização via identity-access (recepção, profissional, gerente).
- Acesso à agenda auditado. Segredos de canais de notificação no Secrets
  Manager.

## Tratamento de erros

- Conflito de horário retorna erro claro sem expor agenda de terceiros.
- Falha de envio de lembrete é registrada e reprocessada (fila com DLQ).

## Estratégia de testes

- Testes de conflito de horário e prevenção de overbooking.
- Testes de transições de status e histórico auditável.
- Testes de isolamento por tenant/unidade.
- Testes de reprocessamento de lembretes com falha.
