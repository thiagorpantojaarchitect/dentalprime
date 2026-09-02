# Tarefas — treatment-plan

- [ ] 1. Estruturar o serviço treatment-plan
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 6_

- [ ] 2. Modelar persistência e migrações
  - [ ] 2.1 Migrações para procedure_catalog
    - tenant_id, UUID, custo base, campos de auditoria
    - _Requisitos: 5_
  - [ ] 2.2 Migrações para treatment_plan (versionado) e treatment_plan_item
    - Fases, ordem, dependências, status
    - _Requisitos: 1, 2, 4_
  - [ ] 2.3 Migração para plan_acceptance (histórico)
    - _Requisitos: 3_

- [ ] 3. Implementar ProcedureCatalogService
  - CRUD de procedimentos próprios; bloquear códigos licenciados sem acordo
  - _Requisitos: 5_

- [ ] 4. Implementar TreatmentPlanService
  - Criar plano com autoria; revisar criando nova versão; consultar
  - _Requisitos: 1, 4_

- [ ] 5. Implementar PlanItemService
  - Itens com custo, fase, ordem, dependências e status
  - Transições de status com histórico
  - _Requisitos: 2, 4_

- [ ] 6. Implementar AcceptanceService
  - Registrar aceitação/recusa/adiamento com histórico
  - Publicar TreatmentItemAccepted para finance
  - _Requisitos: 3_

- [ ] 7. Publicar eventos de domínio
  - TreatmentPlanCreated, TreatmentItemAccepted, TreatmentItemCompleted,
    versionados
  - _Requisitos: 3_

- [ ] 8. Segurança e integridade clínica
  - Confirmação humana obrigatória para decisões; RBAC; auditoria; isolamento por
    tenant
  - _Requisitos: 6_

- [ ] 9. Verificação final
  - Build e testes; cobrir versionamento, aceitação/evento, bloqueio de código
    licenciado e isolamento
  - _Requisitos: 1, 3, 4, 5, 6_
