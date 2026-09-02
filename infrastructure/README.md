# infrastructure/

Infraestrutura como código (AWS CDK, TypeScript). Nada é provisionado nesta fase
de fundação.

Regras:
- Toda infraestrutura é criada por CDK; nenhum recurso manual pelo console em
  ambientes compartilhados.
- Stacks por ambiente (development, staging, production) e por domínio.
- Região primária `sa-east-1`. Nomes de recursos com hífens, nunca travessões.
- Deploy usa funções IAM dedicadas por ambiente, com aprovação. Autenticar no
  Kiro não concede permissão de deploy.
- Segurança e LGPD por padrão: KMS, Secrets Manager, criptografia, auditoria,
  backups imutáveis.

Ver `documentation/architecture-aws.md` e `.kiro/steering/architecture.md`.
