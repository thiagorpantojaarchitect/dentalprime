/**
 * Inicializacao de telemetria (OpenTelemetry) para os servicos de backend.
 *
 * Tracing distribuido via OTel Node SDK com auto-instrumentacao (HTTP, pg,
 * fastify, etc.). O exportador OTLP envia para o endpoint definido em
 * OTEL_EXPORTER_OTLP_ENDPOINT (ex.: collector ADOT como sidecar). Se o endpoint
 * nao estiver configurado, a telemetria e um no-op: nada e iniciado, sem custo
 * nem dependencia de rede. Isso mantem dev e testes simples.
 *
 * Privacidade/LGPD: nao adicionamos atributos com PII nos spans. A instrumentacao
 * de banco (pg) nao captura valores de parametros por padrao. Consultas
 * parametrizadas mantem os dados fora do texto do span.
 *
 * Importante: deve ser chamada ANTES de importar/instanciar o app, para que as
 * bibliotecas sejam instrumentadas no momento do require/import.
 */

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export interface TelemetryHandle {
  /** Encerra o SDK, drenando spans pendentes. No-op se nao iniciado. */
  shutdown(): Promise<void>;
}

export interface TelemetryOptions {
  /** Nome do servico reportado nos spans (ex.: "identity-access"). */
  readonly serviceName: string;
  /** Versao do servico (opcional). */
  readonly serviceVersion?: string | undefined;
  /** Ambiente de deploy (development/staging/production), opcional. */
  readonly environment?: string | undefined;
}

const NOOP: TelemetryHandle = {
  async shutdown(): Promise<void> {
    /* no-op */
  },
};

/**
 * Inicia a telemetria se OTEL_EXPORTER_OTLP_ENDPOINT estiver definido; caso
 * contrario, retorna um handle no-op. Nunca lanca: falha de telemetria nao pode
 * derrubar o servico.
 */
export function startTelemetry(options: TelemetryOptions): TelemetryHandle {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return NOOP;
  }

  try {
    const attributes: Record<string, string> = {
      [ATTR_SERVICE_NAME]: options.serviceName,
    };
    if (options.serviceVersion) {
      attributes[ATTR_SERVICE_VERSION] = options.serviceVersion;
    }
    if (options.environment) {
      attributes["deployment.environment.name"] = options.environment;
    }

    const sdk = new NodeSDK({
      resource: resourceFromAttributes(attributes),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Instrumentacao de fs e ruidosa e de pouco valor aqui.
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    sdk.start();

    return {
      async shutdown(): Promise<void> {
        try {
          await sdk.shutdown();
        } catch {
          // Encerramento de telemetria nunca deve propagar erro.
        }
      },
    };
  } catch {
    // Qualquer falha ao iniciar telemetria e ignorada: o servico segue normal.
    return NOOP;
  }
}
