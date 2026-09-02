# Design — identity-access

## Visão geral

O identity-access é um serviço de domínio que oferece autenticação, autorização
RBAC, gestão de usuários/papéis, isolamento multi-tenant e auditoria de acesso.
Expõe contratos consumidos pelos demais módulos (via token e verificação de
permissão) e publica eventos de identidade.

Referências: `documentation/architecture-aws.md`, `documentation/data-model.md`,
`.kiro/steering/security-lgpd.md`.

## Arquitetura

- **Camada de identidade**: Cognito (ou equivalente) para autenticação,
  emissão/renovação de tokens e MFA.
- **Camada de autorização (aplicação)**: RBAC próprio, escopado por tenant e
  unidade, complementando a identidade.
- **Persistência**: Aurora PostgreSQL. Tabelas conforme `data-model.md`
  (`tenant`, `clinic_unit`, `user`, `role`, `permission`, `user_role`,
  `session`, `audit_log`).
- **Eventos**: publica em EventBridge (ex.: `UserInvited`, `UserDeactivated`,
  `RoleChanged`) para consumo por outros domínios.

## Componentes

### AuthService
- Login, logout, refresh de token, verificação de MFA.
- Não persiste tokens em claro; guarda apenas metadados de sessão.

### AuthorizationService
- Resolve permissões efetivas de um usuário em um tenant/unidade.
- Ponto único de decisão (allow/deny) consultado pelos módulos.

### TenantService
- Cria e gerencia tenants e unidades; garante `tenant_id` em toda operação.

### UserService
- Convite, ativação, desativação, atribuição de papéis.

### AuditService
- Grava trilha imutável de acesso/alteração de dados sensíveis.

## Isolamento multi-tenant

- Contexto autenticado carrega `tenant_id` e unidades acessíveis.
- Repositórios recebem o contexto e aplicam o filtro por `tenant_id`
  obrigatoriamente. Tentativa de acesso cruzado é negada e auditada.

## Modelo de dados

Ver `documentation/data-model.md`, domínio identity-access. UUID como PK,
unicidade de chaves naturais por tenant, campos de auditoria padrão.

## Contratos

- **Token**: JWT com claims mínimas (`sub`, `tenant_id`, papéis/escopos). Sem
  PII sensível no token.
- **Verificação de permissão**: API interna `can(user, action, scope)`.
- **Eventos**: versionados; mudanças incompatíveis criam nova versão.

## Segurança

- Criptografia KMS em repouso, TLS em trânsito.
- Segredos (credenciais de banco, chaves da camada de identidade) no Secrets
  Manager, resolvidos em runtime.
- Rate limiting e proteção contra enumeração no login.
- Logs sem segredos nem PII em texto claro.

## Tratamento de erros

- Falha de autenticação retorna erro genérico (sem revelar fator).
- Falha de autorização retorna negação e gera auditoria.
- Erros não vazam stack trace nem dados sensíveis ao cliente.

## Estratégia de testes

- Unitários para resolução de permissões e isolamento por tenant.
- Testes de que acesso cruzado entre tenants é sempre negado.
- Testes de fluxo de convite, ativação e desativação (encerramento de sessão).
- Testes de que segredos/PII não aparecem em logs.
