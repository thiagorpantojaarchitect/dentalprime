/**
 * ObservabilityStack: logs, auditoria e metricas.
 *
 * CloudTrail para auditoria de API da AWS (bucket dedicado e criptografado).
 * Grupo de log central e um dashboard base. Logs nunca contem dados sensiveis
 * ou segredos em texto claro (garantido pela aplicacao; a infra provê destino e
 * criptografia). Tracing distribuido (OpenTelemetry) e integrado via sidecar/
 * collector em iteracao futura; os pontos de integracao ficam documentados.
 */

import { RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { RESOURCE_PREFIX } from "./constants.js";

export interface ObservabilityStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  /** ARN da chave KMS de logs (importada por ARN para evitar ciclo de stacks). */
  readonly logsKeyArn: string;
}

export class ObservabilityStack extends Stack {
  public readonly platformLogGroup: logs.LogGroup;
  public readonly trail: cloudtrail.Trail;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { envConfig, logsKeyArn } = props;
    const suffix = envConfig.name;

    // Chave importada por ARN: o CDK nao muta a policy da chave externa.
    const logsKey = kms.Key.fromKeyArn(this, "LogsKeyRef", logsKeyArn);

    this.platformLogGroup = new logs.LogGroup(this, "PlatformLogGroup", {
      logGroupName: `/${RESOURCE_PREFIX}/${suffix}/platform`,
      retention: envConfig.logRetention,
      encryptionKey: logsKey,
      removalPolicy: envConfig.removalPolicy,
    });

    // Bucket dedicado do CloudTrail: privado, criptografado, TLS obrigatorio.
    const trailBucket = new s3.Bucket(this, "TrailBucket", {
      bucketName: `${RESOURCE_PREFIX}-cloudtrail-${suffix}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: logsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
    });

    this.trail = new cloudtrail.Trail(this, "Trail", {
      trailName: `${RESOURCE_PREFIX}-trail-${suffix}`,
      bucket: trailBucket,
      encryptionKey: logsKey,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: envConfig.isProduction,
      enableFileValidation: true,
    });
  }
}
