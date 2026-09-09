# Tarefas — crm-growth

- [ ] 1. Estruturar o serviço crm-growth
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 6_

- [ ] 2. Modelar persistência e migrações
  - [ ] 2.1 Migrações para lead e interaction
    - _Requisitos: 1, 2_
  - [ ] 2.2 Migrações para campaign e segment
    - _Requisitos: 3, 4_
  - [ ] 2.3 Migração para contact_consent (opt-in/opt-out) e audit_log
    - _Requisitos: 5, 6_

- [ ] 3. Implementar LeadService e InteractionService
  - Status do lead, conversão; registro/listagem de interações; auditar
  - _Requisitos: 1, 2_

- [ ] 4. Implementar ConsentService de contato
  - Consentimento por canal/finalidade, opt-out, isEligible
  - _Requisitos: 5_

- [ ] 5. Implementar CampaignService
  - Criar campanha; selecionar público filtrando por elegibilidade; auditar
  - _Requisitos: 3, 5_

- [ ] 6. Implementar SegmentService
  - Definir e avaliar segmentos por critérios, escopado por tenant
  - _Requisitos: 4_

- [ ] 7. API HTTP e segurança
  - Rotas de leads, interações, campanhas, segmentos, opt-out; RBAC; isolamento
  - Segredos de canais via Secrets Manager
  - _Requisitos: 6_

- [ ] 8. Verificação final
  - Build e testes; cobrir opt-out, conversão, isolamento e autorização
  - _Requisitos: 1, 3, 5, 6_
