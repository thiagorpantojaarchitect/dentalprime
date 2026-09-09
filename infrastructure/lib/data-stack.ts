/**
 * DataStack: persistencia gerenciada.
 *
 * Aurora PostgreSQL (Multi-AZ em producao) e ElastiCache Redis nas subnets
 * isoladas/privadas, sem acesso publico. Bucket S3 para documentos clinicos com
 * criptografia KMS, bloqueio de acesso publico, versionamento e TLS obrigatorio.
 * O isolamento multi-tenant por tenant_id permanece na camada de aplicacao.
 */

import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as kms from "aws-cdk-lib/aws-kms";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { DATABASE_NAME, RESOURCE_PREFIX } from "./constants.js";

export interface DataStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
  /** ARN da chave KMS de dados (importada por ARN para evitar ciclo de stacks). */
  readonly dataKeyArn: string;
  /** ARN do segredo de credenciais do banco. */
  readonly dbCredentialsArn: string;
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
    const { envConfig, vpc, dataKeyArn, dbCredentialsArn } = props;
    const suffix = envConfig.name;

    // Chave e segredo importados por ARN: grants ficam locais a este stack e o
    // CDK nao muta os recursos do SecurityStack (evita ciclo de dependencia).
    const dataKey = kms.Key.fromKeyArn(this, "DataKeyRef", dataKeyArn);
    const dbCredentials = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      "DbCredentialsRef",
      dbCredentialsArn,
    );

    // --- Aurora PostgreSQL ---
    // O ingress dos clientes autorizados e adicionado pelo ComputeStack
    // (compute -> data), mantendo o grafo de dependencia aciclico.
    this.databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSg", {
      vpc,
      description: "Aurora PostgreSQL - acesso somente de clientes autorizados",
      allowAllOutbound: false,
    });

    const readers = envConfig.auroraMultiAz
      ? [rds.ClusterInstance.provisioned("Reader1", { promotionTier: 1 })]
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
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
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
      port: 6379,
    });
    this.redis.addResourceDependency(redisSubnetGroup);

    // --- S3: documentos clinicos ---
    this.clinicalDocumentsBucket = new s3.Bucket(this, "ClinicalDocuments", {
      bucketName: `${RESOURCE_PREFIX}-clinical-documents-${suffix}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: dataKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
    });
  }
}
