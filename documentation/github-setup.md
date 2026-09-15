# Configuração do GitHub para development

O repositório usa GitHub Actions com identidade OIDC temporária. Nenhuma chave
AWS de longa duração deve ser cadastrada em Secrets ou Variables.

## Environment

Crie um GitHub Environment chamado **development**. Recomenda-se:

- required reviewer para autorizar implantações;
- impedir self-review quando houver mais de um mantenedor;
- restringir deployment branches à main;
- manter as variáveis abaixo no Environment, não como segredo no código.

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| AWS_ACCOUNT_ID | sim | ID AWS de 12 dígitos |
| AWS_DEPLOY_ROLE | recomendada | ARN da role assumida pelo workflow |
| BEDROCK_MODEL_ID | só com Bedrock | ID ou ARN completo do modelo/profile |
| BEDROCK_GUARDRAIL_ID | opcional | ID do guardrail |
| BEDROCK_GUARDRAIL_VERSION | junto do ID | versão do guardrail |
| CLINICAL_DOCUMENTS_CORS_ORIGINS | staging/production | origins HTTPS separadas por vírgula |

Se AWS_DEPLOY_ROLE não for informada, o workflow usa
arn:aws:iam::<conta>:role/dentalprime-deploy-development.

O workflow release aceita AWS_OIDC_ROLE para publicar imagens e executar diff.
Ele não implanta stacks. Em uma instalação mínima, prefira conceder à role de
release somente ECR push, leitura CloudFormation/CDK e leitura dos recursos
necessários ao diff.

## Trust policy OIDC

Cadastre o provider token.actions.githubusercontent.com na conta AWS e limite a
trust policy ao repositório e ao Environment development. Substitua
ORGANIZACAO/REPOSITORIO e o ID da conta:

~~~json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<conta>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:ORGANIZACAO/REPOSITORIO:environment:development"
        }
      }
    }
  ]
}
~~~

Não use wildcard para aceitar qualquer repositório ou Environment.

## Permissões da role de deploy

CDK precisa publicar assets, ler/escrever os stacks e assumir as roles do
bootstrap nas duas regiões. A prática recomendada é:

1. executar CDK bootstrap em sa-east-1 e us-east-1 com trust apenas na role de
   deploy;
2. permitir sts:AssumeRole somente nas roles cdk-hnb659fds-* da conta;
3. conceder ECR push apenas em dentalprime/*;
4. permitir ecs:RunTask, ecs:DescribeTasks e iam:PassRole somente nas task roles
   e execution roles criadas pelo stack;
5. permitir as leituras CloudFormation, ECS, CloudWatch e CloudFront usadas nos
   gates, incluindo logs:GetLogEvents somente nos grupos do DentalPrime;
6. permitir sync nos dois buckets de frontend e criação de invalidação somente
   nas distribuições do ambiente.

Evite uma policy AdministratorAccess permanente. Durante o primeiro bootstrap,
uma role separada de plataforma pode criar/ajustar as roles do CDK; a role diária
de deploy assume apenas essas roles controladas.

## Proteções de branch

Na branch main, exija:

- pull request antes de merge;
- checks do workflow ci;
- branch atualizada antes do merge;
- revisão de CODEOWNERS para infrastructure, workflows e migrations;
- bloqueio de force-push e exclusão.

## Workflows

- ci: build, lint, formatação, testes, typecheck mobile, migrations sequenciais
  em PostgreSQL TLS, smoke das sete imagens e CDK synth --strict offline.
- release: publica tags imutáveis no ECR já provisionado e mostra cdk diff.
- deploy-development: provisiona base, registra a revisão nova, migra, executa o
  bootstrap one-shot, publica o Tenant ID não sensível no resumo, ativa os
  serviços, publica os dois frontends e executa gates de saúde e alarmes.

Todas as Actions externas estão fixadas por SHA para impedir que uma tag móvel
troque o código executado sem revisão.

As tags ECR são o SHA do commit e são imutáveis. Reexecutar um workflow não
sobrescreve a imagem; ele reutiliza a tag existente somente quando ela já foi
publicada para o mesmo SHA.

## Checklist inicial

1. Confirme AWS_ACCOUNT_ID e AWS_DEPLOY_ROLE no Environment development.
2. Revise a trust OIDC no IAM.
3. Proteja o Environment com reviewer.
4. Execute ci e confirme o synth estrito.
5. Execute deploy-development com AI_PROVIDER stub.
6. Abra o resumo do job e valide as URLs clinic e admin.
7. Confirme dashboard, CloudTrail, DLQ e recovery point no AWS Backup.
8. Recupere o segredo bootstrap-admin em uma sessão local autorizada, faça o
   primeiro login e troque a senha; não copie a credencial para logs do GitHub.
