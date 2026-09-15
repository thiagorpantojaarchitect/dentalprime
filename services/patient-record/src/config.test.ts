import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const base = {
  DATABASE_URL: "postgres://localhost:5432/dentalprime",
  JWT_SECRET: "x".repeat(32),
};

describe("patient-record config", () => {
  it("uses a synthetic local bucket but requires an explicit production bucket", () => {
    expect(loadConfig({ ...base }).clinicalDocumentsBucket).toBe(
      "dentalprime-clinical-documents-development",
    );
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(
      "clinicalDocumentsBucket",
    );
  });

  it("accepts an S3-compatible endpoint only outside production", () => {
    expect(
      loadConfig({
        ...base,
        CLINICAL_DOCUMENTS_ENDPOINT: "http://localhost:9000",
        CLINICAL_DOCUMENTS_FORCE_PATH_STYLE: "true",
      }),
    ).toMatchObject({
      clinicalDocumentsEndpoint: "http://localhost:9000",
      clinicalDocumentsForcePathStyle: true,
    });
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        CLINICAL_DOCUMENTS_BUCKET: "real-bucket",
        CLINICAL_DOCUMENTS_ENDPOINT: "https://untrusted.invalid",
      }),
    ).toThrow("clinicalDocumentsEndpoint");
  });
});
