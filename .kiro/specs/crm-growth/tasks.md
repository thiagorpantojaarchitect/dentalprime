# Tarefas — crm-growth

- [x] 1. Estruturar o serviço crm-growth
  - Pacote em `services/` em camadas; integrar contexto do identity-access
  - _Requisitos: 1, 6_

- [x] 2. Modelar persistência e migrações
  - [x] 2.1 Migrações para lead e interaction
    - _Requisitos: 1, 2_
  - [x] 2.2 Migrações para campaign e segment
    - _Requisitos: 3, 4_
  - [x] 2.3 Migração para contact_consent (opt-in/opt-out) e audit_log
    - _Requisitos: 5, 6_

- [ ] 3. Implementar LeadService e InteractionService
  - Status do lead, conversão; registro/listagem de interações; auditar
  - **Status em 15/09/2026:** fluxo de leads e interações por lead está pronto;
    falta listar interações diretamente por paciente. É backlog funcional, não
    bloqueia o ambiente de desenvolvimento.
  - _Requisitos: 1, 2_

- [x] 4. Implementar ConsentService de contato
  - Consentimento por canal/finalidade, opt-out, isEligible
  - _Requisitos: 5_

- [x] 5. Implementar CampaignService
  - Criar campanha; selecionar público filtrando por elegibilidade; auditar
  - _Requisitos: 3, 5_

- [ ] 6. Implementar SegmentService
  - Definir e avaliar segmentos por critérios, escopado por tenant
  - **Status em 15/09/2026:** definição e persistência existem; falta o avaliador
    de critérios contra contatos do tenant. É backlog funcional de campanhas.
  - _Requisitos: 4_

- [ ] 7. API HTTP e segurança
  - Rotas de leads, interações, campanhas, segmentos, opt-out; RBAC; isolamento
  - Segredos de canais via Secrets Manager
  - **Status em 15/09/2026:** rotas, RBAC e isolamento estão prontos; faltam os
    conectores de comunicação e seus segredos em runtime. É integração externa
    necessária antes de campanhas reais/produção.
  - _Requisitos: 6_

- [x] 8. Verificação final
  - Build e testes; cobrir opt-out, conversão, isolamento e autorização
  - _Requisitos: 1, 3, 5, 6_
