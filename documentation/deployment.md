# Implantação do ambiente de desenvolvimento

Este runbook descreve o caminho suportado para provisionar o DentalPrime na AWS.
O fluxo oficial é o workflow GitHub Actions **deploy-development**. Ele usa OIDC,
não armazena chaves AWS no GitHub e mantém os serviços desligados até as
migrações da imagem nova terminarem.

## Arquitetura implantada

- Região principal: sa-east-1.
- Região global de borda: us-east-1, para CloudFront e WAF.
- Dois sites privados em S3: clinic-web e admin-portal, cada um com sua
  distribuição CloudFront.
- APIs same-origin sob /api/{identity,patients,scheduling,treatment,finance,crm,ai}.
- ALB público apenas como origem do CloudFront. As rotas úteis exigem um header
  secreto injetado pelo CloudFront; acesso direto ao ALB recebe 404.
- Sete serviços ECS Fargate, Aurora PostgreSQL, Redis autenticado, EventBridge,
  SQS com DLQ, bucket clínico criptografado, CloudTrail, dashboard e alarmes.

O ALB seleciona o domínio pelo prefixo público e, depois do roteamento, remove
/api/<domínio>. Assim, /api/patients/ready chega ao serviço patient-record como
/ready. /health continua disponível internamente como verificação de processo;
/ready valida também a dependência de banco e é usado por ECS, ALB e pelo gate
do deploy.

## Pré-requisitos

1. Conta AWS com o CDK bootstrap permitido em sa-east-1 e us-east-1.
2. GitHub Environment chamado development, com aprovação obrigatória se o time
   desejar um gate humano.
3. Variáveis AWS_ACCOUNT_ID e AWS_DEPLOY_ROLE configuradas conforme
   [github-setup.md](./github-setup.md).
4. Node.js 22 e dependências instaladas para verificações locais.
5. OIDC do GitHub configurado; não crie access keys para o pipeline.

## Ordem greenfield

O workflow executa esta sequência, que não deve ser invertida:

1. CDK bootstrap nas duas regiões.
2. Síntese estrita e implantação de Network, Security, Registry, Data e
   Messaging.
3. Build e push das sete imagens no ECR criado pelo RegistryStack.
4. Implantação do ComputeStack com desiredCount=0. Isso registra as task
   definitions de aplicação e migração da tag exata do commit sem iniciar
   tráfego.
5. Resolução da revisão recém-registrada e execução sequencial das sete
   migrations. Qualquer exit code diferente de zero interrompe o fluxo.
6. Execução one-shot e idempotente do bootstrap do primeiro tenant. A task lê
   nome, e-mail e senha diretamente do Secrets Manager e o workflow nunca
   recebe nem imprime esses valores.
7. Nova implantação do ComputeStack com a contagem normal, seguida de Edge e
   Observability.
8. Espera da estabilidade ECS, publicação dos dois frontends, invalidação do
   CloudFront, verificação /ready por domínio e gate de alarmes.

Essa separação elimina o ciclo de primeiro provisionamento: o ECR existe antes
da imagem, e a task de migração existe antes de a migração ser executada.

## Executar pelo GitHub

Abra Actions, selecione **deploy-development**, escolha o provedor de IA e
execute. Para desenvolvimento, mantenha o padrão stub. O workflow publica no
resumo os endereços do clinic e do admin e o Tenant ID não sensível necessário
para o primeiro login.

Para usar Amazon Bedrock, configure BEDROCK_MODEL_ID. Pode ser um ID simples de
foundation model ou um ARN completo, inclusive de inference profile. Se usar
guardrail, configure juntos BEDROCK_GUARDRAIL_ID e
BEDROCK_GUARDRAIL_VERSION. A role do ai-front-desk recebe somente as ações e os
recursos informados.

## Verificações locais sem implantar

~~~bash
npm run typecheck --workspace @dentalprime/infrastructure
npm test --workspace @dentalprime/infrastructure
cd infrastructure
npx cdk synth --strict -c env=development -c account=111111111111 -c desiredCount=0
~~~

A conta acima é sintética e serve somente para síntese offline. Para diff ou
deploy use o ID real da conta. O arquivo cdk.context.json contém apenas AZs
sintéticas para que a CI não precise consultar a AWS.

## Configuração de runtime

Todos os serviços recebem TRUST_PROXY=2, DATABASE_SSLMODE=verify-full,
DATABASE_SCHEMA exclusivo, token Redis via Secrets Manager e conexão TLS.
Schemas:

| Serviço | Schema |
| --- | --- |
| identity-access | identity_access |
| patient-record | patient_record |
| smart-scheduling | smart_scheduling |
| treatment-plan | treatment_plan |
| finance | finance |
| crm-growth | crm_growth |
| ai-front-desk | ai_front_desk |

O patient-record possui acesso apenas a objetos sob tenants/* no bucket clínico
e às operações KMS necessárias para URLs pré-assinadas. Smart Scheduling,
Treatment Plan e Finance podem publicar somente no event bus do ambiente. Apenas
esses três recebem `EVENT_PROVIDER=eventbridge`; apenas o serviço de IA pode
invocar Bedrock.

Em development, o CORS do bucket aceita qualquer origin para viabilizar URLs
CloudFront geradas no primeiro provisionamento; o bucket continua privado e a
assinatura temporária é a autoridade de acesso. Somente GET, PUT e HEAD são
permitidos, com headers de conteúdo/AWS e exposição de ETag. Staging e production
falham na síntese sem `clinicalDocumentsCorsOrigins` contendo origins HTTPS
explícitas, separadas por vírgula.

## Autenticação de desenvolvimento

O caminho ativo usa a autenticação interna do identity-access e JWT. Cognito foi
retirado da infraestrutura porque os aplicativos e serviços não o integravam;
manter dois provedores criaria uma falsa sensação de segurança e dois estados de
usuário. O bootstrap local/development cria os dados iniciais pelo fluxo do
próprio identity-access. Uma futura adoção de Cognito deve ser tratada como uma
migração explícita de autenticação, tokens e autorização, não como um recurso
paralelo.

No primeiro deploy, o SecurityStack cria o segredo
dentalprime/development/bootstrap-admin. O pipeline injeta seus quatro campos
somente na task de migration do identity-access e executa RUN_MODE=bootstrap uma
vez; novas execuções retornam already-initialized quando um tenant já existe.
O output do stack revela apenas o ARN, nunca o conteúdo.

Após a task terminar, o pipeline lê apenas seu stream dedicado
`identity-access-migrate/identity-access-migrate/<task-id>`, valida o UUID e
publica o Tenant ID no resumo. Se o resumo não estiver disponível, um operador
com acesso auditado pode localizar a execução em CloudWatch Logs, no grupo
`/dentalprime/development/identity-access`, e consultar essa mesma mensagem. O
Tenant ID não é segredo; nome, e-mail e senha continuam restritos ao Secrets
Manager.

Um operador autorizado recupera a credencial inicial pelo processo corporativo
de acesso ao Secrets Manager, em sessão auditada e com MFA. O runbook não inclui
um comando que imprima o segredo para reduzir o risco de cópia acidental em
histórico, CI, chat ou ticket. No primeiro login, troque a senha pela API/tela
autenticada. Para manter o segredo como meio de recuperação, o operador deve
atualizar sua versão depois da troca; apenas rotacionar o valor no Secrets
Manager não altera o hash já persistido no banco.

## Rollback

- Se uma migration ou o bootstrap falhar, desiredCount permanece zero para um primeiro
  provisionamento. Corrija a migration de forma aditiva e execute um novo
  commit; não reutilize uma tag imutável.
- Se a ativação falhar, o circuit breaker do ECS reverte a implantação do
  serviço. Consulte eventos ECS e logs antes de repetir.
- Frontends usam assets versionados e index.html sem cache. Reexecutar um commit
  anterior publica suas imagens e assets e invalida as distribuições.
- Alterações de banco devem ser compatíveis com a versão anterior durante o
  rollout. Não use rollback destrutivo automático de schema.

## Backup e restauração do Aurora

Desenvolvimento mantém snapshots automáticos e um recovery point diário no AWS
Backup por 7 dias. Produção mantém retenção maior, backup contínuo e Vault Lock;
cópia para outra conta/região permanece uma decisão de DR de produção.

Exercício de restore:

1. No AWS Backup, selecione o vault dentalprime-database-development e um
   recovery point do Aurora.
2. Escolha Restore e crie um cluster novo nas subnets isoladas, com o security
   group do banco e a chave KMS do ambiente. Nunca restaure por cima do cluster
   ativo.
3. Crie credenciais temporárias no Secrets Manager e conecte uma task de
   validação sem tráfego público.
4. Valide integridade, versão de migrations e uma amostra por tenant.
5. Para promoção, abra uma mudança aprovada que atualize o endpoint/secret e
   execute novamente /ready e testes funcionais.
6. Remova o cluster de teste após registrar evidências. Em produção, siga a
   política de retenção e aprovação antes da remoção.

## Limitações deliberadas de development

O ambiente usa uma NAT Gateway, uma instância Aurora writer, Redis sem réplica e
uma task por serviço para conter custo. Isso não representa a topologia de alta
disponibilidade de produção. Domínios próprios e certificados ACM também ficam
fora do primeiro provisionamento; as URLs CloudFront funcionam imediatamente.
Development usa a NAT já existente para acessar APIs AWS por TLS e mantém apenas
o endpoint S3 gratuito; os quatro endpoints de interface por AZ são ativados em
produção, onde a redução de exposição justifica o custo fixo.

O acesso CloudFront → ALB usa HTTP somente neste ambiente sem domínio e
certificado próprios; um header de origem impede que as rotas úteis sejam
chamadas diretamente no ALB. Staging e produção exigem domínio, certificado ACM
e TLS também nesse trecho.

Os refresh tokens são revogados ao trocar senha, papel ou status do usuário. Um
access token já emitido continua válido até seu TTL máximo de 900 segundos;
revogação imediata entre os sete serviços exigirá denylist ou introspecção antes
de liberar dados reais.

`ReminderScheduled.v1` é publicado no EventBridge e entregue à fila com DLQ,
mas a entrega externa de SMS/e-mail/WhatsApp depende de um worker e de um
provedor ainda não escolhidos. Não existe consumidor fictício que marque ou
descarte lembretes silenciosamente; essa integração permanece bloqueada para
uso real até a definição de canal, consentimento e credenciais.
