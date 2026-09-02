# packages/

Bibliotecas compartilhadas entre apps e services (tipos, contratos de eventos,
utilitários, cliente de autenticação, componentes comuns).

Regras:
- Sem dependência de infraestrutura específica de um serviço.
- Contratos versionados; mudanças incompatíveis criam nova versão.
- TypeScript `strict`, testes obrigatórios.

Ver `.kiro/steering/coding-standards.md`.

## Pacotes

- **@dentalprime/core** — tipos base compartilhados: contexto multi-tenant
  (`TenantContext`, papeis) e contrato de eventos de dominio (`DomainEvent`,
  `createDomainEvent`).
