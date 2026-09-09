#!/usr/bin/env node
/**
 * Entrypoint da aplicacao CDK do DentalPrime.
 *
 * Monta, por ambiente, o conjunto de stacks com dependencias por props tipadas
 * (evita exports frageis e o "deadly embrace"). Aplica cdk-nag (AwsSolutionsChecks)
 * para conformidade na sintese.
 *
 * Deploy e bootstrap NAO ocorrem aqui: a operacao padrao e `cdk synth`. A
 * implantacao usa perfis/funcoes IAM dedicados por ambiente, com aprovacao
 * explicita. Autenticar no Kiro nao concede permissao de deploy.
 *
 * Ambiente sintetizado: definido por contexto `-c env=<development|staging|
 * production>` (padrao: development).
 */

import { App, Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

import {
  getEnvironmentConfig,
  type EnvironmentName,
} from "../lib/config/environments.js";
import { CLOUDFRONT_GLOBAL_REGION, RESOURCE_PREFIX } from "../lib/constants.js";
import { acknowledgeNagRules } from "../lib/nag-acknowledgements.js";
import { ComputeStack } from "../lib/compute-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { EdgeStack } from "../lib/edge-stack.js";
import { IdentityStack } from "../lib/identity-stack.js";
import { MessagingStack } from "../lib/messaging-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { SecurityStack } from "../lib/security-stack.js";

const app = new App();

const requested =
  (app.node.tryGetContext("env") as EnvironmentName | undefined) ?? "development";
const envConfig = getEnvironmentConfig(requested);

// Tag da imagem a implantar (ex.: -c imageTag=<commit-sha>). Padrao "latest"
// apenas para sintese local; o pipeline informa a tag imutavel publicada.
const imageTag = (app.node.tryGetContext("imageTag") as string | undefined) ?? "latest";

// Ambiente CDK (conta/regiao). Conta resolvida do contexto/CLI se ausente.
const account = envConfig.account ?? process.env.CDK_DEFAULT_ACCOUNT;
const primaryEnv = { account, region: envConfig.region };
// Recursos globais do CloudFront (WAF CLOUDFRONT, ACM) residem em us-east-1.
const edgeEnv = { account, region: CLOUDFRONT_GLOBAL_REGION };

const prefix = `${RESOURCE_PREFIX}-${envConfig.name}`;

const network = new NetworkStack(app, `${prefix}-network`, {
  env: primaryEnv,
  envConfig,
});

const security = new SecurityStack(app, `${prefix}-security`, {
  env: primaryEnv,
  envConfig,
});

const data = new DataStack(app, `${prefix}-data`, {
  env: primaryEnv,
  envConfig,
  vpc: network.vpc,
  dataKeyArn: security.dataKey.keyArn,
  dbCredentialsArn: security.dbCredentials.secretArn,
});
data.addStackDependency(network);
data.addStackDependency(security);

const messaging = new MessagingStack(app, `${prefix}-messaging`, {
  env: primaryEnv,
  envConfig,
  dataKeyArn: security.dataKey.keyArn,
});
messaging.addStackDependency(security);

const identity = new IdentityStack(app, `${prefix}-identity`, {
  env: primaryEnv,
  envConfig,
});

const compute = new ComputeStack(app, `${prefix}-compute`, {
  env: primaryEnv,
  envConfig,
  vpc: network.vpc,
  logsKeyArn: security.logsKey.keyArn,
  databaseSecurityGroup: data.databaseSecurityGroup,
  redisSecurityGroup: data.redisSecurityGroup,
  dbCredentialsArn: security.dbCredentials.secretArn,
  databaseEndpoint: data.database.clusterEndpoint.hostname,
  jwtSecretArn: security.jwtSecret.secretArn,
  dataKeyArn: security.dataKey.keyArn,
  imageTag,
});
compute.addStackDependency(data);
compute.addStackDependency(network);

// EdgeStack fica em us-east-1 (WAF CLOUDFRONT). Referencia o ALB do compute
// entre regioes; crossRegionReferences habilita a passagem tipada.
const edge = new EdgeStack(app, `${prefix}-edge`, {
  env: edgeEnv,
  crossRegionReferences: true,
  envConfig,
  loadBalancerDnsName: compute.loadBalancer.loadBalancerDnsName,
});
edge.addStackDependency(compute);

const observability = new ObservabilityStack(app, `${prefix}-observability`, {
  env: primaryEnv,
  envConfig,
  logsKeyArn: security.logsKey.keyArn,
});
observability.addStackDependency(security);

// Reconhecimentos de cdk-nag por stack (decisoes desta fase, documentadas).
for (const stack of [
  network,
  security,
  data,
  messaging,
  identity,
  compute,
  edge,
  observability,
]) {
  acknowledgeNagRules(stack, envConfig);
}

// Conformidade: cdk-nag (v3) via framework de policy validation do CDK.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));

app.synth();
