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

import { App, Tags, Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

import {
  getEnvironmentConfig,
  type EnvironmentName,
} from "../lib/config/environments.js";
import {
  clinicalDocumentsBucketName,
  CLOUDFRONT_GLOBAL_REGION,
  RESOURCE_PREFIX,
} from "../lib/constants.js";
import { acknowledgeNagRules } from "../lib/nag-acknowledgements.js";
import { ComputeStack } from "../lib/compute-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { EdgeStack } from "../lib/edge-stack.js";
import { MessagingStack } from "../lib/messaging-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { RegistryStack } from "../lib/registry-stack.js";
import { SecurityStack } from "../lib/security-stack.js";

const app = new App();

const requested =
  (app.node.tryGetContext("env") as EnvironmentName | undefined) ?? "development";
const envConfig = getEnvironmentConfig(requested);

// Tag da imagem a implantar (ex.: -c imageTag=<commit-sha>). Padrao "latest"
// apenas para sintese local; o pipeline informa a tag imutavel publicada.
const imageTag = (app.node.tryGetContext("imageTag") as string | undefined) ?? "latest";

const desiredCountContext = app.node.tryGetContext("desiredCount") as string | undefined;
const desiredCountOverride = desiredCountContext
  ? Number.parseInt(desiredCountContext, 10)
  : undefined;
if (
  desiredCountOverride !== undefined &&
  (!Number.isInteger(desiredCountOverride) || desiredCountOverride < 0)
) {
  throw new Error("Contexto desiredCount deve ser um inteiro maior ou igual a zero");
}

const requestedAiProvider = app.node.tryGetContext("aiProvider") as
  | "stub"
  | "bedrock"
  | undefined;
const aiProvider =
  requestedAiProvider ?? (envConfig.name === "development" ? "stub" : undefined);
if (!aiProvider || !(["stub", "bedrock"] as const).includes(aiProvider)) {
  throw new Error("Contexto aiProvider deve ser stub ou bedrock");
}
if (envConfig.name !== "development" && aiProvider !== "bedrock") {
  throw new Error("Staging e production exigem aiProvider=bedrock");
}
const bedrockModelId = app.node.tryGetContext("bedrockModelId") as string | undefined;
const bedrockGuardrailId = app.node.tryGetContext("bedrockGuardrailId") as
  | string
  | undefined;
const bedrockGuardrailVersion = app.node.tryGetContext("bedrockGuardrailVersion") as
  | string
  | undefined;
if (Boolean(bedrockGuardrailId) !== Boolean(bedrockGuardrailVersion)) {
  throw new Error(
    "bedrockGuardrailId e bedrockGuardrailVersion devem ser informados juntos",
  );
}

// Ambiente CDK (conta/regiao). Conta resolvida do contexto/CLI se ausente.
const account =
  envConfig.account ??
  (app.node.tryGetContext("account") as string | undefined) ??
  process.env.CDK_DEFAULT_ACCOUNT;
if (!account || !/^\d{12}$/.test(account)) {
  throw new Error(
    "Conta AWS obrigatoria: autentique a CLI ou informe -c account=<12-digitos>",
  );
}
const primaryEnv = { account, region: envConfig.region };
// Recursos globais do CloudFront (WAF CLOUDFRONT, ACM) residem em us-east-1.
const edgeEnv = { account, region: CLOUDFRONT_GLOBAL_REGION };

const prefix = `${RESOURCE_PREFIX}-${envConfig.name}`;
const cloudFrontOriginTokenSecretName = `${RESOURCE_PREFIX}/${envConfig.name}/cloudfront-origin-token`;
const clinicalBucketName = clinicalDocumentsBucketName(envConfig.name, account);
const clinicalBucketArn = `arn:aws:s3:::${clinicalBucketName}`;
const corsOriginsContext = app.node.tryGetContext("clinicalDocumentsCorsOrigins") as
  | string
  | undefined;
const clinicalDocumentsCorsOrigins =
  corsOriginsContext
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? (envConfig.name === "development" ? ["*"] : []);
if (clinicalDocumentsCorsOrigins.length === 0) {
  throw new Error(
    "Staging e production exigem clinicalDocumentsCorsOrigins com origins HTTPS explicitas",
  );
}
if (
  envConfig.name !== "development" &&
  clinicalDocumentsCorsOrigins.some(
    (origin) => origin.includes("*") || !origin.startsWith("https://"),
  )
) {
  throw new Error("Staging e production aceitam somente origins CORS HTTPS explicitas");
}

Tags.of(app).add("Project", "DentalPrime");
Tags.of(app).add("Environment", envConfig.name);
Tags.of(app).add("ManagedBy", "AWS-CDK");

const network = new NetworkStack(app, `${prefix}-network`, {
  env: primaryEnv,
  envConfig,
});

const security = new SecurityStack(app, `${prefix}-security`, {
  env: primaryEnv,
  envConfig,
  terminationProtection: envConfig.removalProtection,
});

const registry = new RegistryStack(app, `${prefix}-registry`, {
  env: primaryEnv,
  envConfig,
  terminationProtection: envConfig.removalProtection,
});

const data = new DataStack(app, `${prefix}-data`, {
  env: primaryEnv,
  envConfig,
  vpc: network.vpc,
  clinicalDocumentsCorsOrigins,
  dataKeyArn: security.dataKey.keyArn,
  dbCredentialsArn: security.dbCredentials.secretArn,
  redisAuthTokenArn: security.redisAuthToken.secretArn,
  backupKeyArn: security.backupKey.keyArn,
  terminationProtection: envConfig.removalProtection,
});
data.addStackDependency(network);
data.addStackDependency(security);

const messaging = new MessagingStack(app, `${prefix}-messaging`, {
  env: primaryEnv,
  envConfig,
  dataKeyArn: security.dataKey.keyArn,
});
messaging.addStackDependency(security);

const compute = new ComputeStack(app, `${prefix}-compute`, {
  env: primaryEnv,
  crossRegionReferences: true,
  envConfig,
  vpc: network.vpc,
  repositories: registry.repositories,
  logsKeyArn: security.logsKey.keyArn,
  databaseSecurityGroup: data.databaseSecurityGroup,
  redisSecurityGroup: data.redisSecurityGroup,
  dbCredentialsArn: security.dbCredentials.secretArn,
  databaseEndpoint: data.database.clusterEndpoint.hostname,
  redisEndpoint: data.redis.attrPrimaryEndPointAddress,
  redisAuthTokenArn: security.redisAuthToken.secretArn,
  jwtSecretArn: security.jwtSecret.secretArn,
  dataKeyArn: security.dataKey.keyArn,
  eventBusName: messaging.eventBus.eventBusName,
  eventBusArn: messaging.eventBus.eventBusArn,
  clinicalDocumentsBucketName: clinicalBucketName,
  clinicalDocumentsBucketArn: clinicalBucketArn,
  cloudFrontOriginTokenSecretName,
  developmentBootstrapCredentialsArn: security.developmentBootstrapCredentials?.secretArn,
  imageTag,
  desiredCountOverride,
  aiProvider,
  bedrockModelId,
  bedrockGuardrailId,
  bedrockGuardrailVersion,
});
compute.addStackDependency(data);
compute.addStackDependency(network);
compute.addStackDependency(registry);
compute.addStackDependency(messaging);
compute.addStackDependency(security);

// EdgeStack fica em us-east-1 (WAF CLOUDFRONT). Referencia o ALB do compute
// entre regioes; crossRegionReferences habilita a passagem tipada.
const edge = new EdgeStack(app, `${prefix}-edge`, {
  env: edgeEnv,
  crossRegionReferences: true,
  envConfig,
  loadBalancerDnsName: compute.loadBalancer.loadBalancerDnsName,
  cloudFrontOriginTokenSecretName,
});
edge.addStackDependency(compute);
edge.addStackDependency(security);

const observability = new ObservabilityStack(app, `${prefix}-observability`, {
  env: primaryEnv,
  envConfig,
  logsKeyArn: security.logsKey.keyArn,
  clinicalDocumentsBucket: data.clinicalDocumentsBucket,
  clusterName: compute.cluster.clusterName,
  loadBalancerFullName: compute.loadBalancer.loadBalancerFullName,
  targetGroupFullNames: Object.values(compute.targetGroups).map(
    (targetGroup) => targetGroup.targetGroupFullName,
  ),
  databaseClusterIdentifier: data.database.clusterIdentifier,
  notificationsQueueName: messaging.notificationsQueue.queueName,
  notificationsDlqName: messaging.notificationsDlq.queueName,
  eventBusName: messaging.eventBus.eventBusName,
});
observability.addStackDependency(security);
observability.addStackDependency(data);
observability.addStackDependency(messaging);
observability.addStackDependency(compute);

// Reconhecimentos de cdk-nag por stack (decisoes desta fase, documentadas).
for (const stack of [
  network,
  security,
  registry,
  data,
  messaging,
  compute,
  edge,
  observability,
]) {
  acknowledgeNagRules(stack, envConfig);
}

// Conformidade: cdk-nag (v3) via framework de policy validation do CDK.
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));

app.synth();
