/**
 * DataStack: persistencia gerenciada.
 *
 * Aurora PostgreSQL (Multi-AZ em producao) e ElastiCache Redis nas subnets
 * isoladas/privadas, sem acesso publico. Bucket S3 para documentos clinicos com
 * criptografia KMS, bloqueio de acesso publico, versionamento e TLS obrigatorio.
 * O isolamento multi-tenant por tenant_id permanece na camada de aplicacao.
 */

import {
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
} from "aws-cdk-lib";
import * as backup from "aws-cdk-lib/aws-backup";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as events from "aws-cdk-lib/aws-events";
import * as kms from "aws-cdk-lib/aws-kms";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import {
  clinicalDocumentsBucketName,
  DATABASE_NAME,
  RESOURCE_PREFIX,
} from "./constants.js";

export interface DataStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
  /** Origins exatas autorizadas a usar URLs pre-assinadas do bucket clinico. */
  readonly clinicalDocumentsCorsOrigins: readonly string[];
  /** ARN da chave KMS de dados (importada por ARN para evitar ciclo de stacks). */
  readonly dataKeyArn: string;
  /** ARN do segredo de credenciais do banco. */
  readonly dbCredentialsArn: string;
  /** ARN do token de autenticacao do Redis. */
  readonly redisAuthTokenArn: string;
  /** ARN da chave dedicada aos recovery points do AWS Backup. */
  readonly backupKeyArn: string;
}

export class DataStack extends Stack {
  public readonly database: rds.DatabaseCluster;
  public readonly redis: elasticache.CfnReplicationGroup;
  public readonly clinicalDocumentsBucket: s3.Bucket;
  /** SG do banco; clientes autorizados recebem ingress a partir do ComputeStack. */
  public readonly databaseSecurityGroup: ec2.SecurityGroup;
  /** SG do Redis; clientes autorizados recebem ingress a partir do ComputeStack. */
  public readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const {
      envConfig,
      vpc,
      clinicalDocumentsCorsOrigins,
      dataKeyArn,
      dbCredentialsArn,
      redisAuthTokenArn,
      backupKeyArn,
    } = props;
    const suffix = envConfig.name;

    if (clinicalDocumentsCorsOrigins.length === 0) {
      throw new Error("Informe ao menos uma origin CORS para documentos clinicos");
    }

    // Chave e segredo importados por ARN: grants ficam locais a este stack e o
    // CDK nao muta os recursos do SecurityStack (evita ciclo de dependencia).
    const dataKey = kms.Key.fromKeyArn(this, "DataKeyRef", dataKeyArn);
    const backupKey = kms.Key.fromKeyArn(this, "BackupKeyRef", backupKeyArn);
    const dbCredentials = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "DbCredentialsRef",
      dbCredentialsArn,
    );
    const redisAuthToken = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "RedisAuthTokenRef",
      redisAuthTokenArn,
    );

    // --- Aurora PostgreSQL ---
    // O ingress dos clientes autorizados e adicionado pelo ComputeStack
    // (compute -> data), mantendo o grafo de dependencia aciclico.
    this.databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSg", {
      vpc,
      description: "Aurora PostgreSQL - acesso somente de clientes autorizados",
      allowAllOutbound: false,
    });

    const databaseInstanceType = ec2.InstanceType.of(
      ec2.InstanceClass.T4G,
      ec2.InstanceSize.MEDIUM,
    );
    const readers = envConfig.auroraMultiAz
      ? [
          rds.ClusterInstance.provisioned("Reader1", {
            promotionTier: 1,
            instanceType: databaseInstanceType,
          }),
        ]
      : [];

    this.database = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.databaseSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbCredentials),
      iamAuthentication: true,
      defaultDatabaseName: DATABASE_NAME,
      writer: rds.ClusterInstance.provisioned("Writer", {
        // Aurora PostgreSQL nao suporta t4g.small; o menor burstable e t4g.medium.
        instanceType: databaseInstanceType,
      }),
      readers,
      storageEncrypted: true,
      storageEncryptionKey: dataKey,
      backup: {
        retention: Duration.days(envConfig.isProduction ? 30 : 7),
      },
      deletionProtection: envConfig.removalProtection,
      removalPolicy: envConfig.removalPolicy,
    });

    // Recovery points gerenciados pelo AWS Backup complementam os snapshots
    // automaticos do Aurora e permitem exercitar restore sem depender do banco.
    const backupVault = new backup.BackupVault(this, "DatabaseBackupVault", {
      backupVaultName: `${RESOURCE_PREFIX}-database-${suffix}`,
      encryptionKey: backupKey,
      removalPolicy: envConfig.removalPolicy,
      blockRecoveryPointDeletion: envConfig.isProduction,
      lockConfiguration: envConfig.isProduction
        ? {
            minRetention: Duration.days(30),
            maxRetention: Duration.days(3650),
            changeableFor: Duration.days(7),
          }
        : undefined,
    });
    const backupPlan = new backup.BackupPlan(this, "DatabaseBackupPlan", {
      backupPlanName: `${RESOURCE_PREFIX}-database-${suffix}`,
      backupVault,
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: "daily-aurora",
          scheduleExpression: events.Schedule.cron({ minute: "0", hour: "3" }),
          startWindow: Duration.hours(2),
          completionWindow: Duration.hours(6),
          deleteAfter: Duration.days(envConfig.isProduction ? 35 : 7),
          enableContinuousBackup: envConfig.isProduction,
        }),
      ],
    });
    backupPlan.addSelection("AuroraSelection", {
      resources: [backup.BackupResource.fromRdsDatabaseCluster(this.database)],
    });
    // A role gerada pelo L2 usa a policy oficial do servico. O ID granular tem
    // multiplos "::" e nao pode passar por Validations.acknowledge.
    this.node.addMetadata(Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
      "AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup]":
        "AWS Backup usa sua policy oficial; o plano CDK restringe a selecao ao cluster Aurora deste ambiente.",
    });

    // --- ElastiCache Redis ---
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnetGroup", {
      description: "Subnets isoladas para Redis",
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED })
        .subnetIds,
      cacheSubnetGroupName: `${RESOURCE_PREFIX}-redis-${suffix}`,
    });

    this.redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSg", {
      vpc,
      description: "Redis - acesso somente de clientes autorizados",
      allowAllOutbound: false,
    });

    this.redis = new elasticache.CfnReplicationGroup(this, "Redis", {
      replicationGroupDescription: "Cache/sessao do DentalPrime",
      engine: "redis",
      cacheNodeType: envConfig.isProduction ? "cache.t4g.small" : "cache.t4g.micro",
      numNodeGroups: 1,
      replicasPerNodeGroup: envConfig.isProduction ? 1 : 0,
      automaticFailoverEnabled: envConfig.isProduction,
      multiAzEnabled: envConfig.isProduction,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [this.redisSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      authToken: redisAuthToken.secretValue.unsafeUnwrap(),
      kmsKeyId: dataKeyArn,
      port: 6379,
    });
    this.redis.addResourceDependency(redisSubnetGroup);

    // --- S3: documentos clinicos ---
    const accessLogsBucket = new s3.Bucket(this, "DataAccessLogs", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
    });

    this.clinicalDocumentsBucket = new s3.Bucket(this, "ClinicalDocuments", {
      // Conta no nome evita colisao global sem depender de um nome fixo entre contas.
      bucketName: clinicalDocumentsBucketName(suffix, this.account),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: dataKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: "clinical-documents/",
      cors: [
        {
          allowedOrigins: [...clinicalDocumentsCorsOrigins],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedHeaders: ["content-type", "content-length", "x-amz-*"],
          exposedHeaders: ["ETag"],
          maxAge: 900,
        },
      ],
    });
  }
}
