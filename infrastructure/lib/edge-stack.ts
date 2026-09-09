/**
 * EdgeStack: borda de entrega e protecao.
 *
 * O frontend (clinic-web) e servido de um bucket S3 privado via CloudFront com
 * Origin Access Control (OAC), sem acesso publico direto ao bucket. Um behavior
 * de origem encaminha /api/* ao ALB. Um WAF com regras gerenciadas e limitacao
 * de taxa protege a distribuicao.
 *
 * Nota sobre regiao: o WAF de escopo CLOUDFRONT e o certificado ACM usado pelo
 * CloudFront residem em us-east-1. Este stack cria o WebACL com escopo
 * CLOUDFRONT; ao implantar de verdade, ele deve ser sintetizado/implantado em
 * us-east-1 (documentado no design). Certificado ACM e Route53 sao placeholders,
 * habilitados quando houver dominio.
 */

import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { RESOURCE_PREFIX } from "./constants.js";

export interface EdgeStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  /** DNS publico do ALB (origem /api/*). Passado como string p/ evitar
   * acoplamento de recurso entre regioes. */
  readonly loadBalancerDnsName: string;
}

export class EdgeStack extends Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly webBucket: s3.Bucket;
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);
    const { envConfig, loadBalancerDnsName } = props;
    const suffix = envConfig.name;

    // Bucket estatico privado do frontend.
    this.webBucket = new s3.Bucket(this, "WebBucket", {
      bucketName: `${RESOURCE_PREFIX}-clinic-web-${suffix}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
    });

    // WAF: regras gerenciadas + rate limiting. Escopo CLOUDFRONT (us-east-1).
    this.webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: `${RESOURCE_PREFIX}-webacl-${suffix}`,
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${RESOURCE_PREFIX}-webacl-${suffix}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "AWSManagedCommon",
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "aws-managed-common",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "AWSManagedKnownBadInputs",
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesKnownBadInputsRuleSet",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "aws-managed-known-bad-inputs",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "RateLimit",
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "rate-limit",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    const albOrigin = new origins.HttpOrigin(loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `${RESOURCE_PREFIX}-${suffix}`,
      defaultRootObject: "index.html",
      webAclId: this.webAcl.attrArn,
      // minimumProtocolVersion so tem efeito com certificado ACM proprio; sera
      // definido ao configurar dominio (TLSv1.2_2021).
      defaultBehavior: {
        // Frontend estatico (OAC configurado automaticamente pelo origin S3).
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // SPA: rotas do cliente caem em index.html.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
      ],
    });
  }
}
