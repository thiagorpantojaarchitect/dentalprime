# Tarefas - prontidão do ambiente de desenvolvimento

- [x] 1. Corrigir e testar as imagens Docker dos sete serviços.
- [x] 2. Isolar schemas e migrações por domínio e testar em PostgreSQL real.
- [x] 3. Corrigir convite, ativação e bootstrap inicial de identidade.
- [x] 4. Implementar o contrato público `/api/<domínio>` ponta a ponta.
- [x] 5. Separar Registry/ECR e remover o ciclo do deploy greenfield.
- [x] 6. Publicar `clinic-web` e `admin-portal` com configuração same-origin.
- [x] 7. Integrar EventBridge/SQS, S3 clínico, Redis e Bedrock ao runtime.
- [x] 8. Completar KMS, IAM, logs, dashboard, alarmes e CloudTrail de dados.
- [x] 9. Incluir apps mobile na instalação limpa e validar typecheck.
- [x] 10. Adicionar CI com synth estrito, PostgreSQL, smoke de imagens e apps.
- [x] 11. Atualizar runbooks e documentação de bootstrap/deploy/rollback.
- [x] 12. Executar o gate final de development e registrar evidências.

## Evidências locais de 15/09/2026

- instalação limpa pelo lockfile, build, lint, formatação, testes e synth estrito;
- sete imagens construídas, executadas como usuário não-root e saudáveis;
- sete migrações sequenciais em PostgreSQL 16 com TLS e schemas isolados;
- bootstrap idempotente, ativação de uso único, prontuário self-scoped e refresh atômico;
- MinIO com CORS restrito e upload/download por URL pré-assinada;
- agenda real com catálogo, disponibilidade, bloqueio, conflito concorrente, histórico e escopo de unidade.

O provisionamento numa conta AWS permanece uma ação externa deliberadamente
separada: depende de credenciais, secrets, domínio/certificados e aprovação
explícita. Concluir estas tarefas significa prontidão do código para development,
não validação de produção nem criação de recursos AWS.
