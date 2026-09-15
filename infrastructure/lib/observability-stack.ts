/**
 * ObservabilityStack: auditoria, dashboard e gates operacionais.
 */

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { BACKEND_SERVICES, RESOURCE_PREFIX } from "./constants.js";

export interface ObservabilityStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  readonly logsKeyArn: string;
  readonly clinicalDocumentsBucket: s3.IBucket;
  readonly clusterName: string;
  readonly loadBalancerFullName: string;
  readonly targetGroupFullNames: readonly string[];
  readonly databaseClusterIdentifier: string;
  readonly notificationsQueueName: string;
  readonly notificationsDlqName: string;
  readonly eventBusName: string;
}

export class ObservabilityStack extends Stack {
  public readonly platformLogGroup: logs.LogGroup;
  public readonly trail: cloudtrail.Trail;
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly deploymentAlarms: readonly cloudwatch.Alarm[];

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const {
      envConfig,
      logsKeyArn,
      clinicalDocumentsBucket,
      clusterName,
      loadBalancerFullName,
      targetGroupFullNames,
      databaseClusterIdentifier,
      notificationsQueueName,
      notificationsDlqName,
      eventBusName,
    } = props;
    const suffix = envConfig.name;
    const logsKey = kms.Key.fromKeyArn(this, "LogsKeyRef", logsKeyArn);

    this.platformLogGroup = new logs.LogGroup(this, "PlatformLogGroup", {
      logGroupName: `/${RESOURCE_PREFIX}/${suffix}/platform`,
      retention: envConfig.logRetention,
      encryptionKey: logsKey,
      removalPolicy: envConfig.removalPolicy,
    });

    const accessLogsBucket = new s3.Bucket(this, "AuditAccessLogs", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
    });
    const trailBucket = new s3.Bucket(this, "TrailBucket", {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: logsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: envConfig.removalPolicy,
      autoDeleteObjects: envConfig.removalPolicy === RemovalPolicy.DESTROY,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: "cloudtrail-bucket/",
    });

    this.trail = new cloudtrail.Trail(this, "Trail", {
      trailName: `${RESOURCE_PREFIX}-trail-${suffix}`,
      bucket: trailBucket,
      encryptionKey: logsKey,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: envConfig.isProduction,
      enableFileValidation: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: this.platformLogGroup,
    });
    this.trail.addS3EventSelector([{ bucket: clinicalDocumentsBucket }], {
      readWriteType: cloudtrail.ReadWriteType.ALL,
    });

    const period = Duration.minutes(5);
    const metric = (
      namespace: string,
      metricName: string,
      dimensionsMap: Record<string, string>,
      statistic = "Average",
    ): cloudwatch.Metric =>
      new cloudwatch.Metric({
        namespace,
        metricName,
        dimensionsMap,
        period,
        statistic,
      });

    const alb5xx = metric(
      "AWS/ApplicationELB",
      "HTTPCode_Target_5XX_Count",
      { LoadBalancer: loadBalancerFullName },
      "Sum",
    );
    const unhealthyMetrics = Object.fromEntries(
      targetGroupFullNames.map((targetGroup, index) => [
        `target${index}`,
        metric(
          "AWS/ApplicationELB",
          "UnHealthyHostCount",
          { LoadBalancer: loadBalancerFullName, TargetGroup: targetGroup },
          "Maximum",
        ),
      ]),
    );
    const unhealthyHosts = new cloudwatch.MathExpression({
      expression: "SUM(METRICS())",
      usingMetrics: unhealthyMetrics,
      period,
      label: "Targets nao saudaveis (todos os dominios)",
    });
    const dbCpu = metric(
      "AWS/RDS",
      "CPUUtilization",
      { DBClusterIdentifier: databaseClusterIdentifier },
      "Average",
    );
    const dlqMessages = metric(
      "AWS/SQS",
      "ApproximateNumberOfMessagesVisible",
      { QueueName: notificationsDlqName },
      "Maximum",
    );
    const queueAge = metric(
      "AWS/SQS",
      "ApproximateAgeOfOldestMessage",
      { QueueName: notificationsQueueName },
      "Maximum",
    );
    const failedEvents = metric(
      "AWS/Events",
      "FailedInvocations",
      {
        EventBusName: eventBusName,
        RuleName: `${RESOURCE_PREFIX}-notifications-${suffix}`,
      },
      "Sum",
    );

    const alarmDefaults = {
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    } as const;
    const alarms: cloudwatch.Alarm[] = [
      new cloudwatch.Alarm(this, "AlbTarget5xxAlarm", {
        alarmName: `${RESOURCE_PREFIX}-${suffix}-alb-target-5xx`,
        alarmDescription: "Erros 5xx dos servicos atras do ALB",
        metric: alb5xx,
        threshold: 5,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        ...alarmDefaults,
      }),
      new cloudwatch.Alarm(this, "UnhealthyHostsAlarm", {
        alarmName: `${RESOURCE_PREFIX}-${suffix}-unhealthy-hosts`,
        alarmDescription: "Target groups com hosts nao saudaveis",
        metric: unhealthyHosts,
        threshold: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "DatabaseCpuAlarm", {
        alarmName: `${RESOURCE_PREFIX}-${suffix}-database-cpu-high`,
        alarmDescription: "CPU do Aurora acima de 80%",
        metric: dbCpu,
        threshold: 80,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        ...alarmDefaults,
      }),
      new cloudwatch.Alarm(this, "NotificationsDlqAlarm", {
        alarmName: `${RESOURCE_PREFIX}-${suffix}-notifications-dlq-not-empty`,
        alarmDescription: "Mensagens aguardando tratamento na DLQ",
        metric: dlqMessages,
        threshold: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, "NotificationsAgeAlarm", {
        alarmName: `${RESOURCE_PREFIX}-${suffix}-notifications-age-high`,
        alarmDescription: "Mensagem de notificacao aguardando mais de cinco minutos",
        metric: queueAge,
        threshold: 300,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        ...alarmDefaults,
      }),
      new cloudwatch.Alarm(this, "EventBridgeFailuresAlarm", {
        alarmName: `${RESOURCE_PREFIX}-${suffix}-eventbridge-failures`,
        alarmDescription: "Falha na entrega de eventos de dominio",
        metric: failedEvents,
        threshold: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    ];

    const ecsCpuMetrics = BACKEND_SERVICES.map((service) =>
      metric("AWS/ECS", "CPUUtilization", {
        ClusterName: clusterName,
        ServiceName: `${RESOURCE_PREFIX}-${service.name}-${suffix}`,
      }),
    );

    this.dashboard = new cloudwatch.Dashboard(this, "OperationsDashboard", {
      dashboardName: `${RESOURCE_PREFIX}-${suffix}-operations`,
      start: "-PT8H",
      periodOverride: cloudwatch.PeriodOverride.INHERIT,
    });
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        width: 24,
        height: 2,
        markdown: `# DentalPrime - ${suffix}\nSaude do ambiente e gates de deploy`,
      }),
      new cloudwatch.AlarmStatusWidget({
        width: 24,
        height: 6,
        title: "Alarmes de deploy",
        alarms,
      }),
      new cloudwatch.GraphWidget({
        width: 12,
        height: 6,
        title: "ALB - erros e hosts nao saudaveis",
        left: [alb5xx, unhealthyHosts],
      }),
      new cloudwatch.GraphWidget({
        width: 12,
        height: 6,
        title: "Aurora - CPU",
        left: [dbCpu],
      }),
      new cloudwatch.GraphWidget({
        width: 24,
        height: 6,
        title: "ECS - CPU por servico",
        left: ecsCpuMetrics,
      }),
      new cloudwatch.GraphWidget({
        width: 24,
        height: 6,
        title: "Mensageria - fila, DLQ e falhas de eventos",
        left: [queueAge, dlqMessages, failedEvents],
      }),
    );

    this.deploymentAlarms = alarms;
    new CfnOutput(this, "DashboardName", { value: this.dashboard.dashboardName });
    new CfnOutput(this, "DeploymentAlarmPrefix", {
      value: `${RESOURCE_PREFIX}-${suffix}-`,
    });
  }
}
