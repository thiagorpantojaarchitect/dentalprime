/**
 * ComputeStack: sete servicos de dominio em ECS Fargate.
 *
 * Os repositorios ECR chegam do RegistryStack, portanto ja existem antes do
 * build. O pipeline primeiro implanta este stack com desiredCount=0, executa a
 * revisao exata das migrations e somente depois ativa os servicos.
 */

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  Validations,
  type StackProps,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { BACKEND_SERVICES, DATABASE_NAME, RESOURCE_PREFIX } from "./constants.js";

export type AiProvider = "stub" | "bedrock";

export interface ComputeStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
  readonly repositories: Readonly<Record<string, ecr.IRepository>>;
  readonly logsKeyArn: string;
  readonly databaseSecurityGroup: ec2.ISecurityGroup;
  readonly redisSecurityGroup: ec2.ISecurityGroup;
  readonly dbCredentialsArn: string;
  readonly databaseEndpoint: string;
  readonly redisEndpoint: string;
  readonly redisAuthTokenArn: string;
  readonly jwtSecretArn: string;
  readonly dataKeyArn: string;
  readonly eventBusName: string;
  readonly eventBusArn: string;
  readonly clinicalDocumentsBucketName: string;
  readonly clinicalDocumentsBucketArn: string;
  readonly cloudFrontOriginTokenSecretName: string;
  readonly developmentBootstrapCredentialsArn?: string;
  readonly imageTag?: string;
  /** Zero na fase prepare-runtime; omitido para usar o valor do ambiente. */
  readonly desiredCountOverride?: number;
  readonly aiProvider?: AiProvider;
  readonly bedrockModelId?: string;
  readonly bedrockGuardrailId?: string;
  readonly bedrockGuardrailVersion?: string;
}

export class ComputeStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly migrationTaskDefinitions: Readonly<
    Record<string, ecs.FargateTaskDefinition>
  >;
  public readonly services: Readonly<Record<string, ecs.FargateService>>;
  public readonly targetGroups: Readonly<Record<string, elbv2.ApplicationTargetGroup>>;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    const {
      envConfig,
      vpc,
      repositories,
      logsKeyArn,
      databaseSecurityGroup,
      redisSecurityGroup,
      dbCredentialsArn,
      databaseEndpoint,
      redisEndpoint,
      redisAuthTokenArn,
      jwtSecretArn,
      dataKeyArn,
      eventBusName,
      eventBusArn,
      clinicalDocumentsBucketName,
      clinicalDocumentsBucketArn,
      cloudFrontOriginTokenSecretName,
      developmentBootstrapCredentialsArn,
      imageTag = "latest",
      desiredCountOverride,
      aiProvider = "stub",
      bedrockModelId,
      bedrockGuardrailId,
      bedrockGuardrailVersion,
    } = props;
    const suffix = envConfig.name;
    const desiredCount = desiredCountOverride ?? envConfig.desiredCount;

    if (aiProvider === "bedrock" && !bedrockModelId) {
      throw new Error("bedrockModelId e obrigatorio quando aiProvider=bedrock");
    }

    const dbCredentials = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "DbCredentialsRef",
      dbCredentialsArn,
    );
    const jwtSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "JwtSecretRef",
      jwtSecretArn,
    );
    const redisAuthToken = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "RedisAuthTokenRef",
      redisAuthTokenArn,
    );
    const developmentBootstrapCredentials = developmentBootstrapCredentialsArn
      ? secretsmanager.Secret.fromSecretCompleteArn(
          this,
          "DevelopmentBootstrapCredentialsRef",
          developmentBootstrapCredentialsArn,
        )
      : undefined;
    const logsKey = kms.Key.fromKeyArn(this, "LogsKeyRef", logsKeyArn);
    const originToken = SecretValue.secretsManager(
      cloudFrontOriginTokenSecretName,
    ).unsafeUnwrap();

    this.cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: `${RESOURCE_PREFIX}-cluster-${suffix}`,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: `${RESOURCE_PREFIX}-alb-${suffix}`,
      vpc,
      internetFacing: true,
      deletionProtection: envConfig.removalProtection,
      dropInvalidHeaderFields: true,
    });

    const accessLogsBucket = new s3.Bucket(this, "LoadBalancerAccessLogs", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
    });
    this.loadBalancer.logAccessLogs(accessLogsBucket, "alb");

    // O listener e publico para ser uma origem CloudFront, mas nenhuma rota util
    // casa sem o header secreto injetado somente pela distribuicao.
    const listener = this.loadBalancer.addListener("HttpListener", {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: "application/json",
        messageBody: JSON.stringify({ error: { code: "NOT_FOUND" } }),
      }),
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSg", {
      vpc,
      description: "Tasks ECS dos servicos de backend",
      allowAllOutbound: true,
    });
    const redisClientSecurityGroup = new ec2.SecurityGroup(
      this,
      "IdentityRedisClientSg",
      {
        vpc,
        description: "Acesso Redis exclusivo do identity-access",
        allowAllOutbound: true,
      },
    );
    new ec2.CfnSecurityGroupIngress(this, "DbIngressFromServices", {
      groupId: databaseSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      sourceSecurityGroupId: serviceSecurityGroup.securityGroupId,
      description: "PostgreSQL a partir das tasks de backend",
    });
    new ec2.CfnSecurityGroupIngress(this, "RedisIngressFromServices", {
      groupId: redisSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 6379,
      toPort: 6379,
      sourceSecurityGroupId: redisClientSecurityGroup.securityGroupId,
      description: "Redis somente a partir do identity-access",
    });

    const migrationTaskDefinitions: Record<string, ecs.FargateTaskDefinition> = {};
    const services: Record<string, ecs.FargateService> = {};
    const targetGroups: Record<string, elbv2.ApplicationTargetGroup> = {};
    let priority = 10;

    for (const service of BACKEND_SERVICES) {
      const repository = repositories[service.name];
      if (!repository) {
        throw new Error(`Repositorio ECR ausente para ${service.name}`);
      }

      const logGroup = new logs.LogGroup(this, `${service.name}-Logs`, {
        logGroupName: `/${RESOURCE_PREFIX}/${suffix}/${service.name}`,
        retention: envConfig.logRetention,
        encryptionKey: logsKey,
        removalPolicy: envConfig.removalPolicy,
      });

      const runtimePlatform: ecs.RuntimePlatform = {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      };
      const taskDefinition = new ecs.FargateTaskDefinition(this, `${service.name}-Task`, {
        family: `${RESOURCE_PREFIX}-${service.name}-${suffix}`,
        cpu: 256,
        memoryLimitMiB: 512,
        runtimePlatform,
      });

      taskDefinition.addToExecutionRolePolicy(
        new iam.PolicyStatement({ actions: ["kms:Decrypt"], resources: [dataKeyArn] }),
      );

      const image = ecs.ContainerImage.fromEcrRepository(repository, imageTag);
      const baseEnvironment: Record<string, string> = {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: envConfig.name,
        PORT: String(service.port),
        DATABASE_HOST: databaseEndpoint,
        DATABASE_PORT: "5432",
        DATABASE_NAME,
        DATABASE_SCHEMA: service.databaseSchema,
        DATABASE_SSLMODE: "verify-full",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        OTEL_SERVICE_NAME: service.name,
        OTEL_PROPAGATORS: "xray,tracecontext",
        // Cadeia publica esperada: cliente -> CloudFront -> ALB -> Fastify.
        // Um hop-count exato impede que X-Forwarded-For arbitrario seja aceito.
        TRUST_PROXY: "2",
      };
      const baseSecrets: Record<string, ecs.Secret> = {
        DATABASE_USERNAME: ecs.Secret.fromSecretsManager(dbCredentials, "username"),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbCredentials, "password"),
        JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
      };

      const publishesEvents = ["smart-scheduling", "treatment-plan", "finance"].includes(
        service.name,
      );
      if (publishesEvents) {
        baseEnvironment.EVENT_PROVIDER = "eventbridge";
        baseEnvironment.EVENT_BUS_NAME = eventBusName;
        baseEnvironment.AWS_REGION = envConfig.region;
        taskDefinition.taskRole.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ["events:PutEvents"],
            resources: [eventBusArn],
          }),
        );
      }

      if (service.name === "identity-access") {
        baseEnvironment.REDIS_HOST = redisEndpoint;
        baseEnvironment.REDIS_PORT = "6379";
        baseEnvironment.REDIS_TLS_ENABLED = "true";
        baseEnvironment.REDIS_URL = `rediss://${redisEndpoint}:6379`;
        baseEnvironment.INVITATION_TTL_SECONDS = envConfig.isProduction
          ? "86400"
          : "604800";
        baseSecrets.REDIS_AUTH_TOKEN = ecs.Secret.fromSecretsManager(redisAuthToken);
      }

      if (service.name === "patient-record") {
        baseEnvironment.CLINICAL_DOCUMENTS_BUCKET = clinicalDocumentsBucketName;
        baseEnvironment.CLINICAL_DOCUMENT_MAX_BYTES = "26214400";
        baseEnvironment.PRESIGNED_URL_TTL_SECONDS = "900";
        baseEnvironment.AWS_REGION = envConfig.region;
        taskDefinition.taskRole.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ["s3:ListBucket"],
            resources: [clinicalDocumentsBucketArn],
            conditions: { StringLike: { "s3:prefix": ["tenants/*"] } },
          }),
        );
        taskDefinition.taskRole.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ["s3:GetObject", "s3:PutObject"],
            resources: [`${clinicalDocumentsBucketArn}/tenants/*`],
          }),
        );
        // Validations.acknowledge reserva "::" como delimitador e nao aceita o
        // ARN S3 granular. Registramos a mesma metadata diretamente no construct
        // exclusivo da role do patient-record.
        taskDefinition.taskRole.node.addMetadata(
          Validations.ACKNOWLEDGED_RULES_METADATA_KEY,
          {
            [`AwsSolutions-IAM5[Resource::${clinicalDocumentsBucketArn}/tenants/*]`]:
              "Objetos clinicos usam chaves dinamicas sob tenants/<tenant-id>/; o wildcard e limitado a esse prefixo e somente a role do patient-record possui acesso.",
          },
        );
        taskDefinition.taskRole.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
            resources: [dataKeyArn],
          }),
        );
      }

      if (service.name === "ai-front-desk") {
        baseEnvironment.AI_PROVIDER = aiProvider;
        baseEnvironment.BEDROCK_REGION = envConfig.region;
        baseEnvironment.BEDROCK_MAX_TOKENS = "1024";
        if (aiProvider === "bedrock" && bedrockModelId) {
          baseEnvironment.BEDROCK_MODEL_ID = bedrockModelId;
          const modelResource = bedrockModelId.startsWith("arn:")
            ? bedrockModelId
            : this.formatArn({
                service: "bedrock",
                account: "",
                resource: "foundation-model",
                resourceName: bedrockModelId,
              });
          taskDefinition.taskRole.addToPrincipalPolicy(
            new iam.PolicyStatement({
              actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
              resources: [modelResource],
            }),
          );
        }
        if (bedrockGuardrailId && bedrockGuardrailVersion) {
          baseEnvironment.BEDROCK_GUARDRAIL_ID = bedrockGuardrailId;
          baseEnvironment.BEDROCK_GUARDRAIL_VERSION = bedrockGuardrailVersion;
          taskDefinition.taskRole.addToPrincipalPolicy(
            new iam.PolicyStatement({
              actions: ["bedrock:ApplyGuardrail"],
              resources: [
                this.formatArn({
                  service: "bedrock",
                  resource: "guardrail",
                  resourceName: bedrockGuardrailId,
                }),
              ],
            }),
          );
        }
      }

      const container = taskDefinition.addContainer("app", {
        image,
        containerName: service.name,
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: service.name, logGroup }),
        environment: baseEnvironment,
        secrets: baseSecrets,
        readonlyRootFilesystem: true,
        stopTimeout: Duration.seconds(30),
        healthCheck: {
          command: [
            "CMD-SHELL",
            `wget --no-verbose --tries=1 --spider http://127.0.0.1:${service.port}/ready || exit 1`,
          ],
          interval: Duration.seconds(30),
          timeout: Duration.seconds(5),
          retries: 3,
          startPeriod: Duration.seconds(20),
        },
      });
      container.addPortMappings({ containerPort: service.port });

      taskDefinition.addContainer("adot", {
        image: ecs.ContainerImage.fromRegistry(
          "public.ecr.aws/aws-observability/aws-otel-collector@sha256:bb72328152c72fb9662056759b275f7cc85e115db12bbb114fbea9f68dc4816c",
        ),
        containerName: "adot-collector",
        command: ["--config=/etc/ecs/ecs-default-config.yaml"],
        essential: false,
        readonlyRootFilesystem: true,
        stopTimeout: Duration.seconds(30),
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: `${service.name}-adot`,
          logGroup,
        }),
      });
      taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: [
            "xray:PutTraceSegments",
            "xray:PutTelemetryRecords",
            "xray:GetSamplingRules",
            "xray:GetSamplingTargets",
            "xray:GetSamplingStatisticSummaries",
            "cloudwatch:PutMetricData",
          ],
          resources: ["*"],
        }),
      );

      const migrationTask = new ecs.FargateTaskDefinition(
        this,
        `${service.name}-MigrationTask`,
        {
          family: `${RESOURCE_PREFIX}-${service.name}-migrate-${suffix}`,
          cpu: 256,
          memoryLimitMiB: 512,
          runtimePlatform,
        },
      );
      migrationTask.addToExecutionRolePolicy(
        new iam.PolicyStatement({ actions: ["kms:Decrypt"], resources: [dataKeyArn] }),
      );
      const migrationSecrets = { ...baseSecrets };
      if (service.name === "identity-access" && developmentBootstrapCredentials) {
        migrationSecrets.BOOTSTRAP_TENANT_NAME = ecs.Secret.fromSecretsManager(
          developmentBootstrapCredentials,
          "tenantName",
        );
        migrationSecrets.BOOTSTRAP_ADMIN_EMAIL = ecs.Secret.fromSecretsManager(
          developmentBootstrapCredentials,
          "adminEmail",
        );
        migrationSecrets.BOOTSTRAP_ADMIN_NAME = ecs.Secret.fromSecretsManager(
          developmentBootstrapCredentials,
          "adminName",
        );
        migrationSecrets.BOOTSTRAP_ADMIN_PASSWORD = ecs.Secret.fromSecretsManager(
          developmentBootstrapCredentials,
          "adminPassword",
        );
      }
      migrationTask.addContainer("migrate", {
        image,
        containerName: `${service.name}-migrate`,
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: `${service.name}-migrate`,
          logGroup,
        }),
        environment: { ...baseEnvironment, RUN_MODE: "migrate" },
        secrets: migrationSecrets,
        readonlyRootFilesystem: true,
        stopTimeout: Duration.seconds(30),
      });
      migrationTaskDefinitions[service.name] = migrationTask;

      const fargateService = new ecs.FargateService(this, `${service.name}-Service`, {
        serviceName: `${RESOURCE_PREFIX}-${service.name}-${suffix}`,
        cluster: this.cluster,
        taskDefinition,
        desiredCount,
        securityGroups:
          service.name === "identity-access"
            ? [serviceSecurityGroup, redisClientSecurityGroup]
            : [serviceSecurityGroup],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        circuitBreaker: { rollback: true },
        minHealthyPercent: envConfig.isProduction ? 100 : 50,
        maxHealthyPercent: 200,
        healthCheckGracePeriod: Duration.seconds(60),
      });
      services[service.name] = fargateService;

      const targetGroup = new elbv2.ApplicationTargetGroup(
        this,
        `${service.name}-TargetGroup`,
        {
          vpc,
          port: service.port,
          protocol: elbv2.ApplicationProtocol.HTTP,
          targetType: elbv2.TargetType.IP,
          targets: [fargateService],
          healthCheck: {
            path: "/ready",
            interval: Duration.seconds(30),
            healthyHttpCodes: "200-399",
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 3,
          },
          deregistrationDelay: Duration.seconds(30),
        },
      );
      targetGroups[service.name] = targetGroup;

      const rule = new elbv2.ApplicationListenerRule(this, `${service.name}-Rule`, {
        listener,
        priority: priority++,
        conditions: [
          elbv2.ListenerCondition.pathPatterns([
            service.apiPathPrefix,
            `${service.apiPathPrefix}/*`,
          ]),
          elbv2.ListenerCondition.httpHeader("x-dentalprime-origin", [originToken]),
        ],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });
      const cfnRule = rule.node.defaultChild as elbv2.CfnListenerRule;
      // O ALB casa /api/<dominio> antes do transform e entrega a rota nativa
      // (/health, /ready, /patients, /appointments...) para o Fastify.
      cfnRule.transforms = [
        {
          type: "url-rewrite",
          urlRewriteConfig: {
            rewrites: [
              {
                regex: `^${service.apiPathPrefix}/?(.*)$`,
                replace: "/$1",
              },
            ],
          },
        },
      ];

      if (envConfig.isProduction) {
        const scaling = fargateService.autoScaleTaskCount({
          minCapacity: envConfig.minCapacity,
          maxCapacity: envConfig.maxCapacity,
        });
        scaling.scaleOnCpuUtilization("CpuScaling", {
          targetUtilizationPercent: 65,
          scaleInCooldown: Duration.seconds(60),
          scaleOutCooldown: Duration.seconds(60),
        });
      }
    }

    this.migrationTaskDefinitions = migrationTaskDefinitions;
    this.services = services;
    this.targetGroups = targetGroups;

    new CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "Nome do cluster ECS",
    });
    new CfnOutput(this, "ServiceSecurityGroupId", {
      value: serviceSecurityGroup.securityGroupId,
      description: "SG usado pelo RunTask de migracao",
    });
  }
}
