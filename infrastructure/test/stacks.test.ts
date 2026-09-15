import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import {
  getEnvironmentConfig,
  allEnvironments,
  type EnvironmentName,
} from "../lib/config/environments.js";
import { BACKEND_SERVICES } from "../lib/constants.js";
import { ComputeStack } from "../lib/compute-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { EdgeStack } from "../lib/edge-stack.js";
import { MessagingStack } from "../lib/messaging-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { RegistryStack } from "../lib/registry-stack.js";
import { SecurityStack } from "../lib/security-stack.js";

const primaryEnv = { account: "111111111111", region: "sa-east-1" };
const edgeEnv = { account: "111111111111", region: "us-east-1" };

interface StackFixtureOptions {
  readonly environmentName?: EnvironmentName;
  readonly desiredCountOverride?: number;
  readonly aiProvider?: "stub" | "bedrock";
  readonly bedrockModelId?: string;
}

function buildProdStacks(options: StackFixtureOptions = {}) {
  const app = new App();
  const envConfig = getEnvironmentConfig(options.environmentName ?? "production");
  const originTokenSecretName = `dentalprime/${envConfig.name}/cloudfront-origin-token`;

  const network = new NetworkStack(app, "net", { env: primaryEnv, envConfig });
  const security = new SecurityStack(app, "sec", { env: primaryEnv, envConfig });
  const registry = new RegistryStack(app, "registry", { env: primaryEnv, envConfig });
  const data = new DataStack(app, "data", {
    env: primaryEnv,
    envConfig,
    vpc: network.vpc,
    clinicalDocumentsCorsOrigins: ["https://clinic.example.test"],
    dataKeyArn: security.dataKey.keyArn,
    dbCredentialsArn: security.dbCredentials.secretArn,
    redisAuthTokenArn: security.redisAuthToken.secretArn,
    backupKeyArn: security.backupKey.keyArn,
  });
  const messaging = new MessagingStack(app, "msg", {
    env: primaryEnv,
    envConfig,
    dataKeyArn: security.dataKey.keyArn,
  });
  const compute = new ComputeStack(app, "cmp", {
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
    clinicalDocumentsBucketName: `dentalprime-clinical-${envConfig.name}-111111111111`,
    clinicalDocumentsBucketArn: `arn:aws:s3:::dentalprime-clinical-${envConfig.name}-111111111111`,
    cloudFrontOriginTokenSecretName: originTokenSecretName,
    developmentBootstrapCredentialsArn:
      security.developmentBootstrapCredentials?.secretArn,
    desiredCountOverride: options.desiredCountOverride,
    aiProvider: options.aiProvider,
    bedrockModelId: options.bedrockModelId,
  });
  const edge = new EdgeStack(app, "edge", {
    env: edgeEnv,
    crossRegionReferences: true,
    envConfig,
    loadBalancerDnsName: compute.loadBalancer.loadBalancerDnsName,
    cloudFrontOriginTokenSecretName: originTokenSecretName,
  });
  const observability = new ObservabilityStack(app, "obs", {
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

  return {
    network,
    security,
    registry,
    data,
    messaging,
    compute,
    edge,
    observability,
  };
}

describe("configuracao de ambientes", () => {
  it("producao usa alta disponibilidade e protecao de remocao", () => {
    const prod = getEnvironmentConfig("production");
    expect(prod.isProduction).toBe(true);
    expect(prod.auroraMultiAz).toBe(true);
    expect(prod.natGateways).toBeGreaterThanOrEqual(2);
    expect(prod.desiredCount).toBeGreaterThanOrEqual(2);
    expect(prod.removalProtection).toBe(true);
  });

  it("desenvolvimento usa recursos reduzidos", () => {
    const dev = getEnvironmentConfig("development");
    expect(dev.isProduction).toBe(false);
    expect(dev.auroraMultiAz).toBe(false);
    expect(dev.natGateways).toBe(1);
    expect(dev.removalProtection).toBe(false);
  });

  it("todos os ambientes usam sa-east-1", () => {
    for (const env of allEnvironments()) {
      expect(env.region).toBe("sa-east-1");
    }
  });
});

describe("NetworkStack", () => {
  it("cria uma VPC com NAT e endpoints", () => {
    const { network } = buildProdStacks();
    const template = Template.fromStack(network);
    template.resourceCountIs("AWS::EC2::VPC", 1);
    template.resourceCountIs("AWS::EC2::VPCEndpoint", 5);
  }, 15_000);

  it("evita endpoints de interface cobrados em development", () => {
    const { network } = buildProdStacks({ environmentName: "development" });
    const template = Template.fromStack(network);
    template.resourceCountIs("AWS::EC2::VPCEndpoint", 1);
  }, 15_000);
});

describe("SecurityStack", () => {
  it("cria chaves KMS e segredos sem valores estaticos", () => {
    const { security } = buildProdStacks();
    const template = Template.fromStack(security);
    template.resourceCountIs("AWS::KMS::Key", 3);
    template.allResourcesProperties("AWS::KMS::Key", { EnableKeyRotation: true });
    template.resourceCountIs("AWS::SecretsManager::Secret", 4);
    const keys = JSON.stringify(template.findResources("AWS::KMS::Key"));
    expect(keys).toContain(":logs:sa-east-1:111111111111:log-group:*");
    expect(keys).toContain(
      ":events:sa-east-1:111111111111:rule/dentalprime-events-production/dentalprime-notifications-production",
    );
  });

  it("gera a credencial de bootstrap somente em development", () => {
    const { security, compute } = buildProdStacks({
      environmentName: "development",
    });
    const securityTemplate = Template.fromStack(security);
    securityTemplate.resourceCountIs("AWS::SecretsManager::Secret", 5);
    securityTemplate.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "dentalprime/development/bootstrap-admin",
      GenerateSecretString: Match.objectLike({
        GenerateStringKey: "adminPassword",
      }),
    });
    const computeTemplate = JSON.stringify(
      Template.fromStack(compute).findResources("AWS::ECS::TaskDefinition"),
    );
    expect(computeTemplate).toContain("BOOTSTRAP_ADMIN_PASSWORD");
    expect(computeTemplate).toContain("BOOTSTRAP_TENANT_NAME");
  }, 15_000);
});

describe("RegistryStack", () => {
  it("cria o ECR antes e fora do ComputeStack", () => {
    const { registry, compute } = buildProdStacks();
    const registryTemplate = Template.fromStack(registry);
    const computeTemplate = Template.fromStack(compute);
    registryTemplate.resourceCountIs("AWS::ECR::Repository", BACKEND_SERVICES.length);
    registryTemplate.hasResourceProperties("AWS::ECR::Repository", {
      ImageScanningConfiguration: { ScanOnPush: true },
      ImageTagMutability: "IMMUTABLE",
    });
    computeTemplate.resourceCountIs("AWS::ECR::Repository", 0);
  });
});

describe("DataStack", () => {
  it("cria Aurora, Redis autenticado e bucket clinico auditavel", () => {
    const { data } = buildProdStacks();
    const template = Template.fromStack(data);
    template.resourceCountIs("AWS::RDS::DBCluster", 1);
    template.resourceCountIs("AWS::Backup::BackupVault", 1);
    template.resourceCountIs("AWS::Backup::BackupPlan", 1);
    template.resourceCountIs("AWS::Backup::BackupSelection", 1);
    template.resourceCountIs("AWS::ElastiCache::ReplicationGroup", 1);
    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      AtRestEncryptionEnabled: true,
      TransitEncryptionEnabled: true,
      AuthToken: Match.anyValue(),
      KmsKeyId: Match.anyValue(),
    });
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      LoggingConfiguration: Match.anyValue(),
    });
    template.hasResourceProperties("AWS::S3::Bucket", {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedOrigins: ["https://clinic.example.test"],
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["content-type", "content-length", "x-amz-*"],
            ExposedHeaders: ["ETag"],
          }),
        ]),
      },
    });
  });
});

describe("MessagingStack", () => {
  it("liga eventos de notificacao a uma fila com DLQ", () => {
    const { messaging } = buildProdStacks();
    const template = Template.fromStack(messaging);
    template.resourceCountIs("AWS::Events::EventBus", 1);
    template.resourceCountIs("AWS::Events::Rule", 1);
    template.resourceCountIs("AWS::SQS::Queue", 2);
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: {
        source: ["dentalprime.smart-scheduling"],
        "detail-type": ["ReminderScheduled.v1"],
      },
    });
    template.hasResourceProperties("AWS::SQS::Queue", {
      RedrivePolicy: { maxReceiveCount: 5 },
    });
  });
});

describe("ComputeStack", () => {
  it("cria servicos e tasks de migracao com runtime endurecido", () => {
    const { compute } = buildProdStacks();
    const template = Template.fromStack(compute);
    template.resourceCountIs("AWS::ECS::Cluster", 1);
    template.resourceCountIs("AWS::ECS::Service", BACKEND_SERVICES.length);
    template.resourceCountIs("AWS::ECS::TaskDefinition", BACKEND_SERVICES.length * 2);
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      RuntimePlatform: {
        CpuArchitecture: "X86_64",
        OperatingSystemFamily: "LINUX",
      },
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({ ReadonlyRootFilesystem: true, StopTimeout: 30 }),
      ]),
    });
  });

  it("injeta um schema PostgreSQL exclusivo em cada dominio", () => {
    const { compute } = buildProdStacks();
    const resources = Template.fromStack(compute).findResources(
      "AWS::ECS::TaskDefinition",
    );
    const serialized = JSON.stringify(resources);
    for (const service of BACKEND_SERVICES) {
      expect(serialized).toContain(
        `"Name":"DATABASE_SCHEMA","Value":"${service.databaseSchema}"`,
      );
    }
    expect(serialized.match(/"Name":"TRUST_PROXY","Value":"2"/gu) ?? []).toHaveLength(
      BACKEND_SERVICES.length * 2,
    );
    expect(
      serialized.match(/"Name":"DEPLOYMENT_ENV","Value":"production"/gu) ?? [],
    ).toHaveLength(BACKEND_SERVICES.length * 2);
    expect(
      serialized.match(/"Name":"DATABASE_SSLMODE","Value":"verify-full"/gu) ?? [],
    ).toHaveLength(BACKEND_SERVICES.length * 2);
    expect(
      serialized.match(/"Name":"EVENT_PROVIDER","Value":"eventbridge"/gu) ?? [],
    ).toHaveLength(3 * 2);
    expect(serialized.match(/"Name":"REDIS_AUTH_TOKEN"/gu) ?? []).toHaveLength(2);
  });

  it("prepara greenfield com zero replicas antes das migracoes", () => {
    const { compute } = buildProdStacks({ desiredCountOverride: 0 });
    const template = Template.fromStack(compute);
    template.allResourcesProperties("AWS::ECS::Service", {
      DesiredCount: 0,
    });
  });

  it("roteia e reescreve cada prefixo somente com o header do CloudFront", () => {
    const { compute } = buildProdStacks();
    const resources = Template.fromStack(compute).findResources(
      "AWS::ElasticLoadBalancingV2::ListenerRule",
    );
    expect(Object.keys(resources)).toHaveLength(BACKEND_SERVICES.length);
    const serialized = JSON.stringify(resources);
    for (const service of BACKEND_SERVICES) {
      expect(serialized).toContain(service.apiPathPrefix);
      expect(serialized).toContain(`^${service.apiPathPrefix}/?(.*)$`);
    }
    expect(serialized).toContain("http-header");
    expect(serialized).toContain("x-dentalprime-origin");
    expect(serialized).toContain("url-rewrite");
  });

  it("fixa a versao do ADOT e usa readiness real", () => {
    const { compute } = buildProdStacks();
    const serialized = JSON.stringify(
      Template.fromStack(compute).findResources("AWS::ECS::TaskDefinition"),
    );
    expect(serialized).toContain(
      "aws-otel-collector@sha256:bb72328152c72fb9662056759b275f7cc85e115db12bbb114fbea9f68dc4816c",
    );
    expect(serialized).not.toContain("aws-otel-collector:v0.49.0");
    expect(serialized).toContain("/ready");
  });

  it("concede EventBridge, S3 e KMS apenas nas task roles necessarias", () => {
    const { compute } = buildProdStacks();
    const policies = JSON.stringify(
      Template.fromStack(compute).findResources("AWS::IAM::Policy"),
    );
    expect(policies).toContain("events:PutEvents");
    expect(policies).toContain("s3:ListBucket");
    expect(policies).toContain("s3:GetObject");
    expect(policies).toContain("s3:PutObject");
    expect(policies).toContain("kms:GenerateDataKey");
    expect(policies).not.toContain("bedrock:InvokeModel");
  });

  it("preserva ARN completo de inference profile na policy Bedrock", () => {
    const inferenceProfileArn =
      "arn:aws:bedrock:us-east-1:111111111111:application-inference-profile/test-profile";
    const { compute } = buildProdStacks({
      aiProvider: "bedrock",
      bedrockModelId: inferenceProfileArn,
    });
    const policies = JSON.stringify(
      Template.fromStack(compute).findResources("AWS::IAM::Policy"),
    );
    expect(policies).toContain(inferenceProfileArn);
    expect(policies).not.toContain(`foundation-model/${inferenceProfileArn}`);
  }, 15_000);
});

describe("EdgeStack", () => {
  it("cria dois frontends privados, logs, WAF e API sem cache", () => {
    const { edge } = buildProdStacks();
    const template = Template.fromStack(edge);
    template.resourceCountIs("AWS::CloudFront::Distribution", 2);
    template.resourceCountIs("AWS::WAFv2::WebACL", 1);
    template.resourceCountIs("AWS::CloudFront::Function", 2);
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Logging: Match.anyValue(),
        CacheBehaviors: Match.arrayWith([Match.objectLike({ PathPattern: "/api/*" })]),
      }),
    });
  });
});

describe("ObservabilityStack", () => {
  it("cria CloudTrail com data events, dashboard e alarmes", () => {
    const { observability } = buildProdStacks();
    const template = Template.fromStack(observability);
    template.resourceCountIs("AWS::CloudTrail::Trail", 1);
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      CloudWatchLogsLogGroupArn: Match.anyValue(),
      EventSelectors: Match.arrayWith([
        Match.objectLike({ DataResources: Match.anyValue() }),
      ]),
    });
    template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 6);
    const alarms = JSON.stringify(template.findResources("AWS::CloudWatch::Alarm"));
    expect(alarms).toContain("TargetGroup");
    expect(alarms).toContain("RuleName");
    expect(alarms).toContain("dentalprime-notifications-production");
  });
});
