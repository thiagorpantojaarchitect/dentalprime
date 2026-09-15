import { afterEach, describe, expect, it, vi } from "vitest";

import { S3ClinicalDocumentStore } from "./s3-document-store.js";

class FakeCommand {
  constructor(readonly input: Record<string, unknown>) {}
}

describe("S3ClinicalDocumentStore", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("signs PUT with exact content type and length and signs scoped GET", async () => {
    const commands: FakeCommand[] = [];
    let clientsCreated = 0;
    const signingOptions: Array<{
      expiresIn: number;
      signableHeaders?: Set<string>;
    }> = [];
    class FakeClient {
      constructor() {
        clientsCreated += 1;
      }

      async send(): Promise<unknown> {
        return {};
      }
    }
    const store = new S3ClinicalDocumentStore({
      bucket: "clinical-documents-development",
      region: "sa-east-1",
      loadS3: async () => ({
        S3Client: FakeClient,
        PutObjectCommand: FakeCommand,
        GetObjectCommand: FakeCommand,
      }),
      loadPresigner: async () => ({
        getSignedUrl: async (_client, command, options) => {
          commands.push(command as FakeCommand);
          signingOptions.push(options);
          return "https://s3.example.invalid/signed";
        },
      }),
    });

    await store.presignUpload({
      key: "tenants/t/patients/p/object",
      contentType: "application/pdf",
      sizeBytes: 1234,
      expiresInSeconds: 300,
    });
    await store.presignDownload({
      key: "tenants/t/patients/p/object",
      expiresInSeconds: 300,
    });

    expect(commands[0]?.input).toEqual({
      Bucket: "clinical-documents-development",
      Key: "tenants/t/patients/p/object",
      ContentType: "application/pdf",
      ContentLength: 1234,
    });
    expect(commands[1]?.input).toEqual({
      Bucket: "clinical-documents-development",
      Key: "tenants/t/patients/p/object",
    });
    expect(clientsCreated).toBe(1);
    expect(signingOptions[0]?.signableHeaders).toEqual(
      new Set(["content-length", "content-type"]),
    );
  });

  it("does not pin the empty-body CRC32 checksum in a real presigned upload", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "development-access-key");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "development-secret-key");
    const store = new S3ClinicalDocumentStore({
      bucket: "clinical-documents-development",
      region: "sa-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
    });

    const signed = new URL(
      await store.presignUpload({
        key: "tenants/t/patients/p/object",
        contentType: "application/pdf",
        sizeBytes: 1234,
        expiresInSeconds: 300,
      }),
    );

    expect(signed.searchParams.has("x-amz-checksum-crc32")).toBe(false);
    expect(signed.hostname).toBe("localhost");
  });
});
