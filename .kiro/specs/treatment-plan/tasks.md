# Tarefas — treatment-plan

- [x] 1. Estruturar o serviço treatment-plan
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 6_

- [x] 2. Modelar persistência e migrações
  - [x] 2.1 Migrações para procedure_catalog
    - tenant_id, UUID, custo base, campos de auditoria
    - _Requisitos: 5_
  - [x] 2.2 Migrações para treatment_plan (versionado) e treatment_plan_item
    - Fases, ordem, dependências, status
    - _Requisitos: 1, 2, 4_
  - [x] 2.3 Migração para plan_acceptance (histórico)
    - _Requisitos: 3_

- [x] 3. Implementar ProcedureCatalogService
  - CRUD de procedimentos próprios; bloquear códigos licenciados sem acordo
  - _Requisitos: 5_

- [x] 4. Implementar TreatmentPlanService
  - Criar plano com autoria; revisar criando nova versão; consultar
  - _Requisitos: 1, 4_

- [x] 5. Implementar PlanItemService
  - Itens com custo, fase, ordem, dependências e status
  - Transições de status com histórico
  - _Requisitos: 2, 4_

- [x] 6. Implementar AcceptanceService
  - Registrar aceitação/recusa/adiamento com histórico
  - Publicar TreatmentItemAccepted para finance
  - _Requisitos: 3_

- [x] 7. Publicar eventos de domínio
  - TreatmentPlanCreated, TreatmentItemAccepted, TreatmentItemCompleted,
    versionados
  - _Requisitos: 3_

- [ ] 8. Segurança e integridade clínica
  - Confirmação humana obrigatória para decisões; RBAC; auditoria; isolamento por
    tenant
  - **Status em 15/09/2026:** RBAC, isolamento e auditoria de alterações estão
    prontos, mas consultas de planos, itens, catálogo e aceitações ainda não são
    auditadas sistematicamente. É gate para uso clínico com dados reais/produção.
  - _Requisitos: 6_

- [x] 9. Verificação final
  - Build e testes; cobrir versionamento, aceitação/evento, bloqueio de código
    licenciado e isolamento
  - _Requisitos: 1, 3, 4, 5, 6_
