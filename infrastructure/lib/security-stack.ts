/**
 * SecurityStack: chaves de criptografia e segredos.
 *
 * Chaves KMS com rotacao para dados, logs e backups. Segredos no Secrets
 * Manager: credenciais de banco, segredo JWT, Redis AUTH e token privado da
 * origem CloudFront. Nenhum valor de segredo vive no codigo; sao resolvidos em
 * runtime. Ver .kiro/steering/security-lgpd.md.
 */

import { ArnFormat, CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { CLOUDFRONT_GLOBAL_REGION, RESOURCE_PREFIX } from "./constants.js";

export interface SecurityStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
}

export class SecurityStack extends Stack {
  /** Chave para dados em repouso (banco, cache, S3). */
  public readonly dataKey: kms.Key;
  /** Chave para grupos de log. */
  public readonly logsKey: kms.Key;
  /** Chave para backups. */
  public readonly backupKey: kms.Key;

  /** Credenciais do banco (usuario/senha gerados). */
  public readonly dbCredentials: secretsmanager.Secret;
  /** Segredo JWT compartilhado por todos os servicos (HS256). */
  public readonly jwtSecret: secretsmanager.Secret;
  /** Token Redis AUTH resolvido somente em runtime. */
  public readonly redisAuthToken: secretsmanager.Secret;
  /** Token que impede acesso direto ao ALB contornando CloudFront/WAF. */
  public readonly cloudFrontOriginToken: secretsmanager.Secret;
  /** Credencial inicial one-shot; existe somente em development. */
  public readonly developmentBootstrapCredentials?: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);
    const { envConfig } = props;
    const suffix = envConfig.name;

    this.dataKey = new kms.Key(this, "DataKey", {
      alias: `${RESOURCE_PREFIX}-data-${suffix}`,
      description: "Criptografia em repouso de dados (banco, cache, S3)",
      enableKeyRotation: true,
      removalPolicy: envConfig.removalPolicy,
    });

    // EventBridge entrega eventos na fila SQS criptografada sem assumir uma
    // role do cliente. O grant na key policy e limitado as regras desta conta.
    this.dataKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowEventBridgeEncryptedSqsDelivery",
        principals: [new iam.ServicePrincipal("events.amazonaws.com")],
        actions: ["kms:Decrypt", "kms:GenerateDataKey"],
        resources: ["*"],
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
          ArnEquals: {
            "aws:SourceArn": this.formatArn({
              service: "events",
              resource: "rule",
              resourceName: `${RESOURCE_PREFIX}-events-${suffix}/${RESOURCE_PREFIX}-notifications-${suffix}`,
            }),
          },
        },
      }),
    );

    this.logsKey = new kms.Key(this, "LogsKey", {
      alias: `${RESOURCE_PREFIX}-logs-${suffix}`,
      description: "Criptografia dos grupos de log",
      enableKeyRotation: true,
      removalPolicy: envConfig.removalPolicy,
    });

    // CloudWatch Logs precisa estar explicitamente autorizado na key policy.
    // O encryption context limita o uso a log groups desta conta/regiao.
    this.logsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudWatchLogsEncryption",
        principals: [new iam.ServicePrincipal(`logs.${this.region}.${this.urlSuffix}`)],
        actions: [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
        ],
        resources: ["*"],
        conditions: {
          ArnLike: {
            "kms:EncryptionContext:aws:logs:arn": this.formatArn({
              service: "logs",
              resource: "log-group",
              resourceName: "*",
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            }),
          },
          StringEquals: {
            "kms:ViaService": `logs.${this.region}.${this.urlSuffix}`,
          },
        },
      }),
    );

    // CloudTrail usa a mesma chave para os arquivos de auditoria. SourceArn e
    // encryption context evitam que outro trail use a chave por confused deputy.
    this.logsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudTrailEncryption",
        principals: [new iam.ServicePrincipal("cloudtrail.amazonaws.com")],
        actions: ["kms:GenerateDataKey*", "kms:DescribeKey"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:SourceArn": this.formatArn({
              service: "cloudtrail",
              resource: "trail",
              resourceName: `${RESOURCE_PREFIX}-trail-${suffix}`,
            }),
          },
          StringLike: {
            "kms:EncryptionContext:aws:cloudtrail:arn": this.formatArn({
              service: "cloudtrail",
              region: "*",
              resource: "trail",
              resourceName: "*",
            }),
          },
        },
      }),
    );

    this.backupKey = new kms.Key(this, "BackupKey", {
      alias: `${RESOURCE_PREFIX}-backup-${suffix}`,
      description: "Criptografia de backups",
      enableKeyRotation: true,
      removalPolicy: envConfig.removalPolicy,
    });

    // Credenciais de banco: usuario fixo, senha gerada. Sem caracteres que
    // quebrem URLs de conexao.
    this.dbCredentials = new secretsmanager.Secret(this, "DbCredentials", {
      secretName: `${RESOURCE_PREFIX}/${suffix}/db-credentials`,
      description: "Credenciais do Aurora PostgreSQL",
      encryptionKey: this.dataKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "dentalprime_app" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // Segredo JWT compartilhado (>= 32 bytes). Gerado; nunca em codigo.
    this.jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      secretName: `${RESOURCE_PREFIX}/${suffix}/jwt-secret`,
      description: "Segredo de assinatura JWT compartilhado entre servicos (HS256)",
      encryptionKey: this.dataKey,
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    this.redisAuthToken = new secretsmanager.Secret(this, "RedisAuthToken", {
      secretName: `${RESOURCE_PREFIX}/${suffix}/redis-auth-token`,
      description: "Token de autenticacao do Redis",
      encryptionKey: this.dataKey,
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // A replica em us-east-1 permite que o stack global do CloudFront resolva
    // o mesmo token sem transportar seu valor entre stacks ou pipelines.
    this.cloudFrontOriginToken = new secretsmanager.Secret(
      this,
      "CloudFrontOriginToken",
      {
        secretName: `${RESOURCE_PREFIX}/${suffix}/cloudfront-origin-token`,
        description: "Token do header privado entre CloudFront e ALB",
        encryptionKey: this.dataKey,
        generateSecretString: {
          passwordLength: 48,
          excludePunctuation: true,
        },
        replicaRegions: [{ region: CLOUDFRONT_GLOBAL_REGION }],
      },
    );

    if (envConfig.name === "development") {
      this.developmentBootstrapCredentials = new secretsmanager.Secret(
        this,
        "DevelopmentBootstrapCredentials",
        {
          secretName: `${RESOURCE_PREFIX}/${suffix}/bootstrap-admin`,
          description:
            "Credencial inicial do tenant development; recuperar somente por operador autorizado",
          encryptionKey: this.dataKey,
          generateSecretString: {
            secretStringTemplate: JSON.stringify({
              tenantName: "Clinica de Desenvolvimento",
              adminEmail: "admin@example.invalid",
              adminName: "Administrador de Desenvolvimento",
            }),
            generateStringKey: "adminPassword",
            passwordLength: 32,
            excludePunctuation: true,
          },
        },
      );
      new CfnOutput(this, "DevelopmentBootstrapCredentialsSecretArn", {
        value: this.developmentBootstrapCredentials.secretArn,
        description:
          "ARN do segredo inicial; o valor nunca e exibido pelo CloudFormation",
      });
    }
  }
}
