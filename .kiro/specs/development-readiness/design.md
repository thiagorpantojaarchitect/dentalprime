# Design - prontidão do ambiente de desenvolvimento

## Decisões

### Identidade

Para development, o `identity-access` interno é a fonte de verdade. Cognito não será provisionado como recurso decorativo. A ativação usa um segredo de convite de uso único armazenado somente como hash. O bootstrap cria um `platform-admin` (operação global) e um `owner` (operação do tenant), informa o `tenantId` sem revelar segredos e exige troca da senha temporária. Troca de senha, mudança de papel e desativação revogam refresh tokens. Uma eventual migração para Cognito deve ser uma spec própria e substituir o fluxo inteiro, não coexistir de forma parcial.

### Portal do paciente

O cadastro clínico mantém `portal_user_id`, único dentro do tenant. A equipe vincula explicitamente uma conta com papel `patient`; o aplicativo usa apenas `/patients/me` e `/patients/me/clinical-records`, resolvidos por tenant + `sub` do JWT. Nenhum identificador de prontuário é aceito no fluxo de autoatendimento.

### Persistência

O cluster Aurora é compartilhado para reduzir custo de development, mas cada domínio usa schema e tabela de controle de migração próprios. Toda conexão fixa seu `search_path` ao schema do serviço. O banco nunca é validado apenas com repositórios em memória: a CI sobe PostgreSQL e executa as sete migrações.

### Roteamento

O contrato externo é:

```text
/api/identity/*   -> identity-access   -> /*
/api/patients/*   -> patient-record    -> /*
/api/scheduling/* -> smart-scheduling -> /*
/api/treatment/*  -> treatment-plan   -> /*
/api/finance/*    -> finance          -> /*
/api/crm/*        -> crm-growth       -> /*
/api/ai/*         -> ai-front-desk    -> /*
```

A borda encaminha ao ALB e a regra remove o prefixo antes do serviço. Os frontends usam URLs same-origin. Health checks internos continuam em `/health`.

Em produção, Fastify confia em exatamente dois saltos de proxy conhecidos (CloudFront e ALB). O origin header compartilhado impede que o ALB ofereça as rotas de aplicação diretamente. Development local não simula uma cadeia de proxies que não existe.

### Provisionamento greenfield

O fluxo é dividido em etapas sem ciclo:

1. bootstrap CDK;
2. stacks base, incluindo Registry/ECR;
3. build e publicação de imagens imutáveis;
4. registro da revisão de migração com a nova imagem;
5. execução das migrações;
6. atualização dos serviços;
7. publicação dos frontends;
8. smoke test e verificação de alarmes.

### Integrações

Os adaptadores AWS usam SDK JavaScript v3, clientes reutilizados, retries adaptativos e IAM de task role. EventBridge recebe eventos versionados sem PII desnecessária. Documentos clínicos usam URLs S3 pré-assinadas de curta duração e chaves confinadas ao tenant. Bedrock usa Converse com `maxTokens` explícito; em development pode permanecer em stub por configuração consciente.

No Compose, MinIO fornece um endpoint S3 compatível estritamente local. Um smoke test realiza upload, download e remoção reais por URL pré-assinada. Endpoints customizados de armazenamento são rejeitados fora de development.

### Consultas administrativas

Tenants, unidades e usuários usam `page`, `pageSize` limitado e `hasMore`. O banco busca somente a página solicitada e os portais não recortam em memória uma resposta parcial.

### Agenda inteligente

Profissionais e recursos são cadastrados por unidade antes do agendamento. A agenda só aceita horários dentro da disponibilidade, respeita bloqueios e impede sobreposição por profissional e por recurso. A proteção contra concorrência existe também no PostgreSQL por constraints de exclusão; `allow_overbooking` é uma decisão explícita e auditável, nunca um efeito colateral.

Criação, mudança de estado e reagendamento usam unidade de trabalho; operações sobre um agendamento existente bloqueiam a linha antes de gravar histórico e auditoria. Usuários limitados a unidades recebem somente dados dessas unidades, inclusive em dashboard, histórico, lembretes e lista de espera. O papel `patient` não herda leitura ampla da agenda do tenant.

A publicação EventBridge ocorre após o commit. Para produção com garantia de entrega, uma spec futura deverá introduzir transactional outbox e um consumidor de lembretes ligado a provedor e consentimento definidos pelo produto.

### Observabilidade

Logs estruturados, ADOT com imagem imutável, dashboard e alarmes cobrem ALB, ECS, Aurora, fila e erros de aplicação. CloudTrail registra eventos de controle e acesso ao bucket clínico. Alarmes tratam dados ausentes explicitamente.

## Gate de conclusão

O ambiente só recebe status GO para development quando todos os critérios em `requirements.md` forem verificados e os testes automatizados reproduzirem o caminho de instalação limpa.
