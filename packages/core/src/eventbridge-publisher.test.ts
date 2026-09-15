import { describe, expect, it } from "vitest";

import { createDomainEvent } from "./events.js";
import { AwsEventBridgePublisher } from "./eventbridge-publisher.js";

class FakeCommand {
  constructor(readonly input: Record<string, unknown>) {}
}

describe("AwsEventBridgePublisher", () => {
  it("publishes the versioned envelope through an AWS SDK v3 command", async () => {
    let sent: FakeCommand | undefined;
    class FakeClient {
      async send(command: unknown): Promise<{ FailedEntryCount: number }> {
        sent = command as FakeCommand;
        return { FailedEntryCount: 0 };
      }
    }
    const publisher = new AwsEventBridgePublisher({
      eventBusName: "development-bus",
      region: "sa-east-1",
      source: "dentalprime.finance",
      loadSdk: async () => ({
        EventBridgeClient: FakeClient,
        PutEventsCommand: FakeCommand,
      }),
    });
    const event = createDomainEvent({
      id: "event-1",
      occurredAt: "2026-09-15T12:00:00.000Z",
      type: "InvoiceIssued",
      version: 1,
      tenantId: "11111111-1111-1111-1111-111111111111",
      payload: { invoiceId: "invoice-1" },
    });

    await publisher.publish(event);

    const entries = sent?.input.Entries as Array<Record<string, unknown>>;
    expect(entries[0]).toMatchObject({
      EventBusName: "development-bus",
      Source: "dentalprime.finance",
      DetailType: "InvoiceIssued.v1",
    });
    expect(JSON.parse(entries[0]?.Detail as string)).toEqual(event);
  });

  it("fails closed when EventBridge reports a rejected entry", async () => {
    class RejectingClient {
      async send(): Promise<{
        FailedEntryCount: number;
        Entries: Array<{ ErrorCode: string }>;
      }> {
        return { FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] };
      }
    }
    const publisher = new AwsEventBridgePublisher({
      eventBusName: "development-bus",
      region: "sa-east-1",
      source: "dentalprime.finance",
      loadSdk: async () => ({
        EventBridgeClient: RejectingClient,
        PutEventsCommand: FakeCommand,
      }),
    });

    await expect(
      publisher.publish(
        createDomainEvent({
          type: "TestEvent",
          version: 1,
          tenantId: "11111111-1111-1111-1111-111111111111",
          payload: {},
        }),
      ),
    ).rejects.toThrow("EventBridge rejected");
  });
});
