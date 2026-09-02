# Tarefas — smart-scheduling

- [ ] 1. Estruturar o serviço smart-scheduling
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 2_

- [ ] 2. Modelar persistência e migrações
  - [ ] 2.1 Migrações para provider, resource, availability
    - tenant_id, unidade, UUID, campos de auditoria
    - _Requisitos: 1_
  - [ ] 2.2 Migrações para appointment e appointment_status_history
    - _Requisitos: 2, 4_
  - [ ] 2.3 Migrações para waitlist_entry e reminder
    - _Requisitos: 5, 3_

- [ ] 3. Implementar AvailabilityService
  - Janelas de disponibilidade por provider/recurso/unidade
  - Regras de horário de funcionamento e bloqueios
  - _Requisitos: 1_

- [ ] 4. Implementar SchedulingService
  - Criar/reagendar/cancelar com verificação de conflito
  - Impedir overbooking (exceto política explícita da clínica)
  - _Requisitos: 2_

- [ ] 5. Implementar histórico de status
  - Transições marcado → confirmado → atendido/faltou/cancelado, auditadas
  - _Requisitos: 4_

- [ ] 6. Implementar ReminderService
  - Envio de lembretes/confirmações; registrar resultado; respeitar
    consentimento de contato
  - Integração assíncrona por eventos (EventBridge/SQS)
  - _Requisitos: 3_

- [ ] 7. Implementar WaitlistService e otimização de encaixe
  - Sugerir encaixes ao liberar horário; sugestões são assistivas
  - _Requisitos: 5_

- [ ] 8. Publicar eventos de agenda
  - AppointmentBooked, AppointmentCancelled, AppointmentConfirmed, versionados
  - _Requisitos: 2, 6_

- [ ] 9. Isolamento e segurança
  - Filtro por tenant/unidade em todas as consultas; auditar acesso à agenda
  - _Requisitos: 6_

- [ ] 10. Verificação final
  - Build e testes; cobrir conflito de horário, transições de status e
    isolamento
  - _Requisitos: 1, 2, 4, 6_
