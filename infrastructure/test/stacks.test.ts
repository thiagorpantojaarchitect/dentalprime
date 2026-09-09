import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, it, expect } from "vitest";

import { getEnvironmentConfig, allEnvironments } from "../lib/config/environments.js";
import { BACKEND_SERVICES } from "../lib/constants.js";
import { ComputeStack } from "../lib/compute-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { EdgeStack } from "../lib/edge-stack.js";
import { IdentityStack } from "../lib/identity-stack.js";
import { MessagingStack } from "../lib/messaging-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { SecurityStack } from "../lib/security-stack.js";

const primaryEnv = { account: "111111111111", region: "sa-east-1" };
const edgeEnv = { account: "111111111111", region: "us-east-1" };

function buildProdStacks() {
  const app = new App();
  const envConfig = getEnvironmentConfig("production");

  const network = new NetworkStack(app, "net", { env: primaryEnv, envConfig });
  const security = new SecurityStack(app, "sec", { env: primaryEnv, envConfig });
  const data = new DataStack(app, "data", {
    env: primaryEnv,
    envConfig,
    vpc: network.vpc,
    dataKeyArn: security.dataKey.keyArn,
    dbCredentialsArn: security.dbCredentials.secretArn,
  });
  const messaging = new MessagingStack(app, "msg", {
    env: primaryEnv,
    envConfig,
    dataKeyArn: security.dataKey.keyArn,
  });
  const identity = new IdentityStack(app, "id", { env: primaryEnv, envConfig });
  const compute = new ComputeStack(app, "cmp", {
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
  });
  const edge = new EdgeStack(app, "edge", {
    env: edgeEnv,
    crossRegionReferences: true,
    envConfig,
    loadBalancerDnsName: compute.loadBalancer.loadBalancerDnsName,
  });
  const observability = new ObservabilityStack(app, "obs", {
    env: primaryEnv,
    envConfig,
    logsKeyArn: security.logsKey.keyArn,
  });

  return { network, security, data, messaging, identity, compute, edge, observability };
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
    const t = Template.fromStack(network);
    t.resourceCountIs("AWS::EC2::VPC", 1);
    // Gateway (S3) + interface endpoints.
    t.resourceCountIs("AWS::EC2::VPCEndpoint", 5);
  });
});

describe("SecurityStack", () => {
  it("cria chaves KMS com rotacao e tres segredos", () => {
    const { security } = buildProdStacks();
    const t = Template.fromStack(security);
    t.resourceCountIs("AWS::KMS::Key", 3);
    t.allResourcesProperties("AWS::KMS::Key", { EnableKeyRotation: true });
    t.resourceCountIs("AWS::SecretsManager::Secret", 3);
  });
});

describe("DataStack", () => {
  it("cria Aurora, Redis e bucket privado criptografado", () => {
    const { data } = buildProdStacks();
    const t = Template.fromStack(data);
    t.resourceCountIs("AWS::RDS::DBCluster", 1);
    t.resourceCountIs("AWS::ElastiCache::ReplicationGroup", 1);
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    t.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      AtRestEncryptionEnabled: true,
      TransitEncryptionEnabled: true,
    });
  });
});

describe("MessagingStack", () => {
  it("cria bus de eventos e fila com DLQ", () => {
    const { messaging } = buildProdStacks();
    const t = Template.fromStack(messaging);
    t.resourceCountIs("AWS::Events::EventBus", 1);
    // Fila principal + DLQ.
    t.resourceCountIs("AWS::SQS::Queue", 2);
    t.hasResourceProperties("AWS::SQS::Queue", {
      RedrivePolicy: { maxReceiveCount: 5 },
    });
  });
});

describe("IdentityStack", () => {
  it("cria user pool com senha forte e MFA obrigatorio em prod", () => {
    const { identity } = buildProdStacks();
    const t = Template.fromStack(identity);
    t.resourceCountIs("AWS::Cognito::UserPool", 1);
    t.hasResourceProperties("AWS::Cognito::UserPool", {
      MfaConfiguration: "ON",
      Policies: { PasswordPolicy: { MinimumLength: 12 } },
    });
  });
});

describe("ComputeStack", () => {
  it("cria um cluster, um ALB e um servico Fargate por dominio", () => {
    const { compute } = buildProdStacks();
    const t = Template.fromStack(compute);
    t.resourceCountIs("AWS::ECS::Cluster", 1);
    t.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
    t.resourceCountIs("AWS::ECS::Service", BACKEND_SERVICES.length);
    t.resourceCountIs("AWS::ECS::TaskDefinition", BACKEND_SERVICES.length);
  });
});

describe("EdgeStack", () => {
  it("cria distribuicao CloudFront com WAF e bucket web privado", () => {
    const { edge } = buildProdStacks();
    const t = Template.fromStack(edge);
    t.resourceCountIs("AWS::CloudFront::Distribution", 1);
    t.resourceCountIs("AWS::WAFv2::WebACL", 1);
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});

describe("ObservabilityStack", () => {
  it("cria CloudTrail e grupo de log", () => {
    const { observability } = buildProdStacks();
    const t = Template.fromStack(observability);
    t.resourceCountIs("AWS::CloudTrail::Trail", 1);
    t.resourceCountIs("AWS::Logs::LogGroup", 1);
  });
});
