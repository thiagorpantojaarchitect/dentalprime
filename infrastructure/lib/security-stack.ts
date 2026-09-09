/**
 * SecurityStack: chaves de criptografia e segredos.
 *
 * Chaves KMS com rotacao para dados, logs e backups. Segredos no Secrets
 * Manager: credenciais de banco, segredo JWT compartilhado entre servicos e um
 * placeholder para chaves de fornecedores de IA. Nenhum valor de segredo vive no
 * codigo; sao resolvidos em runtime. Ver .kiro/steering/security-lgpd.md.
 */

import { Stack, type StackProps } from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { RESOURCE_PREFIX } from "./constants.js";

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
  /** Placeholder para chaves de fornecedores de IA (preenchido fora do codigo). */
  public readonly aiProviderKeys: secretsmanager.Secret;

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

    this.logsKey = new kms.Key(this, "LogsKey", {
      alias: `${RESOURCE_PREFIX}-logs-${suffix}`,
      description: "Criptografia dos grupos de log",
      enableKeyRotation: true,
      removalPolicy: envConfig.removalPolicy,
    });

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

    // Placeholder para chaves de IA (Bedrock/OpenAI/modelos privados). O valor
    // real e definido fora do codigo, via processo seguro. Comeca vazio.
    this.aiProviderKeys = new secretsmanager.Secret(this, "AiProviderKeys", {
      secretName: `${RESOURCE_PREFIX}/${suffix}/ai-provider-keys`,
      description: "Chaves de fornecedores de IA do produto (definidas fora do codigo)",
      encryptionKey: this.dataKey,
      // Sem valor no codigo: o CDK gera um valor inicial; o valor real e
      // definido fora do codigo por processo seguro.
    });
  }
}
