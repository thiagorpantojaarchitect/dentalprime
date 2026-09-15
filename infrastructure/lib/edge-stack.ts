/**
 * EdgeStack: dois frontends privados, CloudFront, WAF e origem de API.
 *
 * CloudFront preserva /api/<dominio> ate o ALB. O listener casa esse caminho e
 * aplica o URL rewrite antes de entregar a rota nativa ao Fastify.
 */

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { RESOURCE_PREFIX } from "./constants.js";

export interface EdgeStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  readonly loadBalancerDnsName: string;
  /** Nome do segredo replicado em us-east-1; o valor nunca cruza o contexto. */
  readonly cloudFrontOriginTokenSecretName: string;
}

interface FrontendDistribution {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
}

export class EdgeStack extends Stack {
  public readonly clinicDistribution: cloudfront.Distribution;
  public readonly adminDistribution: cloudfront.Distribution;
  public readonly clinicWebBucket: s3.Bucket;
  public readonly adminWebBucket: s3.Bucket;
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);
    const { envConfig, loadBalancerDnsName, cloudFrontOriginTokenSecretName } = props;
    const suffix = envConfig.name;

    const accessLogsBucket = new s3.Bucket(this, "EdgeAccessLogs", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
    });

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
              limit: envConfig.isProduction ? 2000 : 500,
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

    const originToken = SecretValue.secretsManager(
      cloudFrontOriginTokenSecretName,
    ).unsafeUnwrap();
    const albOrigin = new origins.HttpOrigin(loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      customHeaders: { "x-dentalprime-origin": originToken },
      connectionAttempts: 3,
      connectionTimeout: Duration.seconds(10),
    });

    const clinic = this.createFrontend(
      "Clinic",
      `${RESOURCE_PREFIX}-clinic-${suffix}`,
      albOrigin,
      accessLogsBucket,
      envConfig,
    );
    const admin = this.createFrontend(
      "Admin",
      `${RESOURCE_PREFIX}-admin-${suffix}`,
      albOrigin,
      accessLogsBucket,
      envConfig,
    );
    this.clinicWebBucket = clinic.bucket;
    this.clinicDistribution = clinic.distribution;
    this.adminWebBucket = admin.bucket;
    this.adminDistribution = admin.distribution;

    new CfnOutput(this, "ClinicWebBucketName", {
      value: this.clinicWebBucket.bucketName,
    });
    new CfnOutput(this, "ClinicDistributionId", {
      value: this.clinicDistribution.distributionId,
    });
    new CfnOutput(this, "ClinicUrl", {
      value: `https://${this.clinicDistribution.distributionDomainName}`,
    });
    new CfnOutput(this, "AdminWebBucketName", {
      value: this.adminWebBucket.bucketName,
    });
    new CfnOutput(this, "AdminDistributionId", {
      value: this.adminDistribution.distributionId,
    });
    new CfnOutput(this, "AdminUrl", {
      value: `https://${this.adminDistribution.distributionDomainName}`,
    });
  }

  private createFrontend(
    id: string,
    comment: string,
    albOrigin: origins.HttpOrigin,
    accessLogsBucket: s3.IBucket,
    envConfig: EnvironmentConfig,
  ): FrontendDistribution {
    const destroy = envConfig.removalPolicy === RemovalPolicy.DESTROY;
    const bucket = new s3.Bucket(this, `${id}WebBucket`, {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: destroy,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `${id.toLowerCase()}-web/`,
    });

    const spaRewrite = new cloudfront.Function(this, `${id}SpaRewrite`, {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: `SPA rewrite do frontend ${id.toLowerCase()}`,
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (!uri.startsWith('/api/') && !uri.includes('.')) {
    request.uri = '/index.html';
  }
  return request;
}`),
    });

    const distribution = new cloudfront.Distribution(this, `${id}Distribution`, {
      comment,
      defaultRootObject: "index.html",
      webAclId: this.webAcl.attrArn,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: accessLogsBucket,
      logFilePrefix: `${id.toLowerCase()}-cloudfront/`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: spaRewrite,
          },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
      },
    });

    return { bucket, distribution };
  }
}
