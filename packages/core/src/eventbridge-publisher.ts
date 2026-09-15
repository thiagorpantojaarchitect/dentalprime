import type { DomainEvent } from "./events.js";

interface PutEventsResult {
  readonly FailedEntryCount?: number;
  readonly Entries?: ReadonlyArray<{
    readonly ErrorCode?: string;
    readonly ErrorMessage?: string;
  }>;
}

interface EventBridgeClientLike {
  send(command: unknown): Promise<PutEventsResult>;
}

interface EventBridgeSdk {
  readonly EventBridgeClient: new (config: {
    readonly region: string;
    readonly maxAttempts: number;
    readonly retryMode: "adaptive";
  }) => EventBridgeClientLike;
  readonly PutEventsCommand: new (input: Record<string, unknown>) => unknown;
}

export interface AwsEventBridgePublisherOptions {
  readonly eventBusName: string;
  readonly region: string;
  readonly source: string;
  readonly loadSdk?: () => Promise<EventBridgeSdk>;
}

/** AWS SDK v3 EventBridge publisher with lazy client initialization. */
export class AwsEventBridgePublisher {
  private clientAndCommand?: Promise<{
    readonly client: EventBridgeClientLike;
    readonly PutEventsCommand: EventBridgeSdk["PutEventsCommand"];
  }>;

  constructor(private readonly options: AwsEventBridgePublisherOptions) {
    if (
      !options.eventBusName.trim() ||
      !/^dentalprime\.[a-z0-9-]+$/u.test(options.source)
    ) {
      throw new Error("Invalid EventBridge publisher configuration.");
    }
  }

  async publish(event: DomainEvent<string, unknown>): Promise<void> {
    const { client, PutEventsCommand } = await this.getClient();
    const output = await client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.options.eventBusName,
            Source: this.options.source,
            DetailType: `${event.type}.v${event.version}`,
            Detail: JSON.stringify(event),
            Time: new Date(event.occurredAt),
          },
        ],
      }),
    );

    if ((output.FailedEntryCount ?? 0) > 0) {
      const code = output.Entries?.find((entry) => entry.ErrorCode)?.ErrorCode;
      throw new Error(`EventBridge rejected a domain event${code ? ` (${code})` : ""}.`);
    }
  }

  private getClient(): Promise<{
    readonly client: EventBridgeClientLike;
    readonly PutEventsCommand: EventBridgeSdk["PutEventsCommand"];
  }> {
    this.clientAndCommand ??= (this.options.loadSdk ?? defaultSdkLoader)().then(
      (sdk) => ({
        client: new sdk.EventBridgeClient({
          region: this.options.region,
          maxAttempts: 5,
          retryMode: "adaptive",
        }),
        PutEventsCommand: sdk.PutEventsCommand,
      }),
    );
    return this.clientAndCommand;
  }
}

async function defaultSdkLoader(): Promise<EventBridgeSdk> {
  return (await import("@aws-sdk/client-eventbridge")) as unknown as EventBridgeSdk;
}
