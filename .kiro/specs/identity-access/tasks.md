# Tarefas — identity-access

- [x] 1. Estruturar o serviço identity-access e contratos base
  - Criar o pacote do serviço em `services/` com estrutura em camadas
  - Definir tipos de contexto autenticado (tenant_id, unidades, papéis)
  - _Requisitos: 1, 3_

- [ ] 2. Modelar persistência e migrações
  - **Status em 15/09/2026:** parcial; sessão e auditoria estão completas, mas
    o catálogo relacional de papéis/permissões previsto em 2.1 permanece aberto.
  - [ ] 2.1 Criar migrações para tenant, clinic_unit, user, role, permission, user_role
    - Incluir tenant_id, chaves UUID, campos de auditoria
    - **Status em 15/09/2026:** `tenant`, `clinic_unit`, `user` e atribuições
      existem, porém papéis/permissões ainda são estáticos em código. Não bloqueia
      desenvolvimento local; é gate de segurança antes de RBAC configurável em produção.
    - _Requisitos: 1, 3, 4_
  - [x] 2.2 Criar migração para session e audit_log (imutável)
    - _Requisitos: 2, 5_

- [x] 3. Implementar isolamento multi-tenant no repositório
  - Camada de repositório que exige e aplica filtro por tenant_id
  - Testes garantindo negação de acesso cruzado entre tenants
  - _Requisitos: 1_

- [ ] 4. Implementar AuthService
  - **Status em 15/09/2026:** parcial; login, refresh e proteção contra abuso
    estão implementados, mas o MFA de 4.2 permanece aberto.
  - [x] 4.1 Login, emissão e renovação de tokens via camada de identidade
    - Sem persistir tokens em claro; apenas metadados de sessão
    - _Requisitos: 2_
  - [ ] 4.2 MFA para papéis administrativos e clínicos
    - **Status em 15/09/2026:** falta desafio, verificação e recuperação de MFA.
      É gate para AWS compartilhada com usuários reais e para produção.
    - _Requisitos: 2_
  - [x] 4.3 Proteção contra enumeração e rate limiting no login
    - _Requisitos: 2, 6_

- [x] 5. Implementar AuthorizationService (RBAC)
  - Resolver permissões efetivas por tenant e unidade
  - API `can(user, action, scope)` como ponto único de decisão
  - Testes de allow/deny por papel e escopo
  - _Requisitos: 3_

- [x] 6. Implementar UserService (gestão de usuários e papéis)
  - Convite, ativação, desativação (encerrando sessões), troca de papel
  - Auditar toda alteração de papel/permissão
  - _Requisitos: 4, 5_

- [x] 7. Implementar AuditService
  - Gravação imutável de acesso/alteração de dados sensíveis
  - Garantir ausência de segredos/PII em claro além do necessário
  - _Requisitos: 5, 6_

- [ ] 8. Publicar eventos de identidade
  - UserInvited, UserDeactivated, RoleChanged em EventBridge, versionados
  - **Status em 15/09/2026:** existem registros de auditoria, mas os três eventos
    ainda não são publicados. É pendência de integração entre domínios, não gate local.
  - _Requisitos: 4_

- [x] 9. Configuração e segredos
  - Resolver segredos via Secrets Manager em runtime
  - Validação/sanitização de entrada e consultas parametrizadas
  - _Requisitos: 6_

- [x] 10. Verificação final
  - Rodar build e testes; garantir cobertura de isolamento e autorização
  - Revisar que mudanças de auth/autorização/cripto foram sinalizadas
  - _Requisitos: 1, 2, 3, 5, 6_
