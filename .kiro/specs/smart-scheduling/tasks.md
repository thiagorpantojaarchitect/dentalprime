# Tarefas — smart-scheduling

- [x] 1. Estruturar o serviço smart-scheduling
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 2_

- [x] 2. Modelar persistência e migrações
  - [x] 2.1 Migrações para provider, resource, availability
    - tenant_id, unidade, UUID, campos de auditoria
    - _Requisitos: 1_
  - [x] 2.2 Migrações para appointment e appointment_status_history
    - _Requisitos: 2, 4_
  - [x] 2.3 Migrações para waitlist_entry e reminder
    - _Requisitos: 5, 3_

- [x] 3. Implementar AvailabilityService
  - Janelas de disponibilidade por provider/recurso/unidade
  - Regras de horário de funcionamento e bloqueios
  - _Requisitos: 1_

- [x] 4. Implementar SchedulingService
  - Criar/reagendar/cancelar com verificação de conflito
  - Impedir overbooking (exceto política explícita da clínica)
  - _Requisitos: 2_

- [x] 5. Implementar histórico de status
  - Transições marcado → confirmado → atendido/faltou/cancelado, auditadas
  - _Requisitos: 4_

- [ ] 6. Implementar ReminderService
  - Envio de lembretes/confirmações; registrar resultado; respeitar
    consentimento de contato
  - Integração assíncrona por eventos (EventBridge/SQS)
  - **Status em 15/09/2026:** agendamento, evento e registro de resultado estão
    prontos; faltam o consumidor de envio e a checagem integrada de consentimento.
    É gate para notificações reais/produção e depende do provedor externo escolhido.
  - _Requisitos: 3_

- [x] 7. Implementar WaitlistService e otimização de encaixe
  - Sugerir encaixes ao liberar horário; sugestões são assistivas
  - _Requisitos: 5_

- [x] 8. Publicar eventos de agenda
  - AppointmentBooked, AppointmentCancelled, AppointmentConfirmed, versionados
  - _Requisitos: 2, 6_

- [x] 9. Isolamento e segurança
  - Filtro por tenant/unidade em todas as consultas; auditar acesso à agenda
  - _Requisitos: 6_

- [x] 10. Verificação final
  - Build e testes; cobrir conflito de horário, transições de status e
    isolamento
  - _Requisitos: 1, 2, 4, 6_
