/**
 * ComputeStack: os servicos de backend em ECS Fargate.
 *
 * Um cluster Fargate roda os sete servicos de dominio, cada um em sua task
 * definition, atras de um Application Load Balancer com roteamento por path.
 * Configuracao vem de variaveis de ambiente; segredos (DATABASE_URL, JWT_SECRET)
 * sao injetados do Secrets Manager em runtime. Cada servico usa o SG de clientes
 * de dados para acessar banco/cache com privilegio minimo.
 *
 * A imagem de cada servico vem de um repositorio ECR proprio; a tag e
 * parametrizada (por commit/ambiente) e publicada pelo pipeline de CI/CD.
 */

import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { BACKEND_SERVICES, DATABASE_NAME, RESOURCE_PREFIX } from "./constants.js";

export interface ComputeStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
  /** ARN da chave KMS de logs (importada por ARN para evitar ciclo de stacks). */
  readonly logsKeyArn: string;
  /** SG do banco (o ComputeStack adiciona ingress a partir do SG dos servicos). */
  readonly databaseSecurityGroup: ec2.ISecurityGroup;
  /** SG do Redis (o ComputeStack adiciona ingress a partir do SG dos servicos). */
  readonly redisSecurityGroup: ec2.ISecurityGroup;
  /**
   * ARN do segredo de credenciais do banco. Passado como ARN (nao como
   * construct) para que os grants sejam por politica de identidade dentro deste
   * stack, evitando mutar o SecurityStack e criar ciclo de dependencia.
   */
  readonly dbCredentialsArn: string;
  /** Endpoint do writer do Aurora. */
  readonly databaseEndpoint: string;
  /** ARN do segredo JWT compartilhado. */
  readonly jwtSecretArn: string;
  /** ARN da chave KMS que cifra os segredos (para conceder decrypt as tasks). */
  readonly dataKeyArn: string;
  /**
   * Tag da imagem de container a implantar (ex.: commit SHA). Publicada pelo
   * pipeline no ECR. Padrao "latest" apenas para sintese local.
   */
  readonly imageTag?: string;
}

export class ComputeStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  /** Repositorios ECR por servico (a imagem e publicada pelo pipeline). */
  public readonly repositories: Record<string, ecr.Repository> = {};

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    const {
      envConfig,
      vpc,
      logsKeyArn,
      databaseSecurityGroup,
      redisSecurityGroup,
      dbCredentialsArn,
      databaseEndpoint,
      jwtSecretArn,
      dataKeyArn,
      imageTag = "latest",
    } = props;
    const suffix = envConfig.name;

    // Segredos importados por ARN neste stack: grants tornam-se politicas de
    // identidade locais (sem mutar o SecurityStack).
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
    // Chave de logs importada por ARN: o CDK nao muta a policy de uma chave
    // externa, evitando dependencia SecurityStack -> ComputeStack.
    const logsKey = kms.Key.fromKeyArn(this, "LogsKeyRef", logsKeyArn);

    this.cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: `${RESOURCE_PREFIX}-cluster-${suffix}`,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ALB publico (a borda real fica atras de CloudFront/WAF no EdgeStack).
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: `${RESOURCE_PREFIX}-alb-${suffix}`,
      vpc,
      internetFacing: true,
    });

    const listener = this.loadBalancer.addListener("HttpListener", {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: "application/json",
        messageBody: JSON.stringify({ error: { code: "NOT_FOUND" } }),
      }),
    });

    // SG comum das tasks (criado neste stack). Autoriza egress e recebe acesso
    // a banco/cache adicionando ingress nos SGs de dados (compute -> data,
    // aciclico).
    const serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSg", {
      vpc,
      description: "Tasks ECS dos servicos de backend",
      allowAllOutbound: true,
    });
    // Regras de ingress criadas neste stack (compute -> data) para manter o
    // grafo aciclico: um CfnSecurityGroupIngress referencia os SGs por id.
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
      sourceSecurityGroupId: serviceSecurityGroup.securityGroupId,
      description: "Redis a partir das tasks de backend",
    });
    const serviceSecurityGroups = [serviceSecurityGroup];

    let priority = 10;
    for (const service of BACKEND_SERVICES) {
      const logGroup = new logs.LogGroup(this, `${service.name}-Logs`, {
        logGroupName: `/${RESOURCE_PREFIX}/${suffix}/${service.name}`,
        retention: envConfig.logRetention,
        encryptionKey: logsKey,
        removalPolicy: envConfig.removalPolicy,
      });

      // Repositorio ECR do servico: scan on push e limpeza de imagens antigas.
      const repository = new ecr.Repository(this, `${service.name}-Repo`, {
        repositoryName: `${RESOURCE_PREFIX}/${service.name}`,
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        encryption: ecr.RepositoryEncryption.KMS,
        removalPolicy: envConfig.removalPolicy,
        emptyOnDelete: envConfig.removalPolicy === RemovalPolicy.DESTROY,
        lifecycleRules: [{ maxImageCount: 20 }],
      });
      this.repositories[service.name] = repository;

      const taskDefinition = new ecs.FargateTaskDefinition(this, `${service.name}-Task`, {
        family: `${RESOURCE_PREFIX}-${service.name}-${suffix}`,
        cpu: 256,
        memoryLimitMiB: 512,
      });

      // Decifrar os segredos exige kms:Decrypt na chave de dados. Concedido por
      // politica de identidade (task + execution role), com a chave referenciada
      // por ARN para nao mutar o SecurityStack. A leitura dos segredos e
      // concedida pelo ecs.Secret abaixo (tambem por politica de identidade,
      // pois os segredos foram importados por ARN neste stack).
      const kmsDecrypt = new iam.PolicyStatement({
        actions: ["kms:Decrypt"],
        resources: [dataKeyArn],
      });
      taskDefinition.taskRole.addToPrincipalPolicy(kmsDecrypt);
      taskDefinition.addToExecutionRolePolicy(kmsDecrypt);

      const container = taskDefinition.addContainer("app", {
        // Imagem publicada pelo pipeline no ECR do servico, na tag informada.
        image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
        containerName: service.name,
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: service.name, logGroup }),
        environment: {
          NODE_ENV: "production",
          PORT: String(service.port),
          // Host/porta/banco nao sao segredos; usuario e senha vem do secret.
          DATABASE_HOST: databaseEndpoint,
          DATABASE_PORT: "5432",
          DATABASE_NAME,
        },
        secrets: {
          // Injetados do Secrets Manager em runtime; nunca em texto plano.
          DATABASE_USERNAME: ecs.Secret.fromSecretsManager(dbCredentials, "username"),
          DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(dbCredentials, "password"),
          JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
        },
      });
      container.addPortMappings({ containerPort: service.port });

      const fargateService = new ecs.FargateService(this, `${service.name}-Service`, {
        serviceName: `${RESOURCE_PREFIX}-${service.name}-${suffix}`,
        cluster: this.cluster,
        taskDefinition,
        desiredCount: envConfig.desiredCount,
        securityGroups: serviceSecurityGroups,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        circuitBreaker: { rollback: true },
        // Mantem capacidade durante deploys (evita cair abaixo do desejado).
        minHealthyPercent: envConfig.isProduction ? 100 : 50,
        maxHealthyPercent: 200,
      });

      listener.addTargets(`${service.name}-Target`, {
        priority: priority++,
        conditions: [elbv2.ListenerCondition.pathPatterns([`${service.pathPrefix}/*`])],
        port: service.port,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [fargateService],
        healthCheck: {
          path: "/health",
          interval: Duration.seconds(30),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
        deregistrationDelay: Duration.seconds(30),
      });

      // Autoscaling por CPU em producao.
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
  }
}
