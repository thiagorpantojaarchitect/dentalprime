/**
 * MessagingStack: comunicacao assincrona entre dominios.
 *
 * Barramento EventBridge para eventos de dominio e filas SQS com dead-letter
 * queue. Filas criptografadas em repouso. Preferir eventos assincronos a
 * acoplamento sincrono direto entre servicos.
 */

import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

import type { EnvironmentConfig } from "./config/environments.js";
import { RESOURCE_PREFIX } from "./constants.js";

export interface MessagingStackProps extends StackProps {
  readonly envConfig: EnvironmentConfig;
  /** ARN da chave KMS de dados (importada por ARN para evitar ciclo de stacks). */
  readonly dataKeyArn: string;
}

export class MessagingStack extends Stack {
  /** Barramento de eventos de dominio. */
  public readonly eventBus: events.EventBus;
  /** Fila de notificacoes (ex.: lembretes, confirmacoes). */
  public readonly notificationsQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);
    const { envConfig, dataKeyArn } = props;
    const suffix = envConfig.name;

    // Chave importada por ARN: o CDK nao muta a policy da chave externa.
    const dataKey = kms.Key.fromKeyArn(this, "DataKeyRef", dataKeyArn);

    this.eventBus = new events.EventBus(this, "EventBus", {
      eventBusName: `${RESOURCE_PREFIX}-events-${suffix}`,
    });

    // Dead-letter queue para mensagens que falham repetidamente.
    const notificationsDlq = new sqs.Queue(this, "NotificationsDlq", {
      queueName: `${RESOURCE_PREFIX}-notifications-dlq-${suffix}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.notificationsQueue = new sqs.Queue(this, "NotificationsQueue", {
      queueName: `${RESOURCE_PREFIX}-notifications-${suffix}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: dataKey,
      visibilityTimeout: Duration.seconds(60),
      enforceSSL: true,
      deadLetterQueue: {
        queue: notificationsDlq,
        maxReceiveCount: 5,
      },
    });
  }
}
