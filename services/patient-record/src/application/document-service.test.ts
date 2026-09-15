import { describe, expect, it } from "vitest";

import { AuthorizationService } from "../domain/authorization.js";
import { ValidationError } from "../domain/errors.js";
import {
  InMemoryAuditRepository,
  InMemoryClinicalDocumentRepository,
  InMemoryPatientRepository,
} from "../infrastructure/memory-repositories.js";
import { AuditService } from "./audit-service.js";
import { DocumentService, type ClinicalDocumentStore } from "./document-service.js";
import { makeContext, TENANT_A, VALID_CPF_1 } from "./test-helpers.js";

async function build() {
  const patients = new InMemoryPatientRepository();
  const documents = new InMemoryClinicalDocumentRepository();
  const auditRepo = new InMemoryAuditRepository();
  const signed: Array<{ operation: string; key: string }> = [];
  const store: ClinicalDocumentStore = {
    presignUpload: async ({ key }) => {
      signed.push({ operation: "put", key });
      return "https://upload.example.invalid/signed";
    },
    presignDownload: async ({ key }) => {
      signed.push({ operation: "get", key });
      return "https://download.example.invalid/signed";
    },
  };
  const actor = makeContext();
  const patient = await patients.create({
    tenantId: TENANT_A,
    fullName: "Pessoa de Teste",
    cpf: VALID_CPF_1.replace(/\D/gu, ""),
    birthDate: null,
    email: null,
    phone: null,
    address: null,
    createdBy: actor.userId,
  });
  const service = new DocumentService({
    documents,
    patients,
    store,
    audit: new AuditService(auditRepo),
    authorization: new AuthorizationService(),
    maxBytes: 1024,
    presignedUrlTtlSeconds: 300,
  });
  return { service, actor, patient, documents, auditRepo, signed };
}

describe("DocumentService", () => {
  it("generates tenant-owned upload and download URLs and audits both", async () => {
    const env = await build();
    const upload = await env.service.createUpload(env.actor, {
      patientId: env.patient.id,
      kind: "radiograph",
      fileName: "exam.png",
      contentType: "image/png",
      sizeBytes: 512,
    });
    expect(upload.requiredHeaders).toEqual({
      "content-type": "image/png",
      "content-length": "512",
    });
    expect(env.signed[0]?.key).toMatch(
      new RegExp(`^tenants/${TENANT_A}/patients/${env.patient.id}/`),
    );

    const download = await env.service.createDownload(
      env.actor,
      env.patient.id,
      upload.documentId,
    );
    expect(download.downloadUrl).toContain("download.example.invalid");
    expect(env.auditRepo.entries.map((entry) => entry.action)).toEqual([
      "clinical_document.upload_authorized",
      "clinical_document.download_authorized",
    ]);
  });

  it("rejects unsupported type, oversized content and path-like file names", async () => {
    const env = await build();
    const base = {
      patientId: env.patient.id,
      kind: "exam",
      fileName: "exam.png",
      contentType: "image/png",
      sizeBytes: 100,
    };
    await expect(
      env.service.createUpload(env.actor, { ...base, contentType: "text/html" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      env.service.createUpload(env.actor, { ...base, sizeBytes: 2048 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      env.service.createUpload(env.actor, { ...base, fileName: "../exam.png" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not expose another tenant document", async () => {
    const env = await build();
    const upload = await env.service.createUpload(env.actor, {
      patientId: env.patient.id,
      kind: "exam",
      fileName: "exam.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
    });
    await expect(
      env.service.createDownload(
        { ...env.actor, tenantId: "22222222-2222-2222-2222-222222222222" },
        env.patient.id,
        upload.documentId,
      ),
    ).rejects.toThrow("Documento nao encontrado");
  });

  it("rejects a persisted key that does not match the canonical tenant path", async () => {
    const env = await build();
    const document = await env.documents.create({
      tenantId: TENANT_A,
      patientId: env.patient.id,
      kind: "exam",
      fileName: "exam.pdf",
      contentType: "application/pdf",
      storageKey: `tenants/${TENANT_A}/patients/${env.patient.id}/object/extra`,
      sizeBytes: 100,
      uploadedBy: env.actor.userId,
    });

    await expect(
      env.service.createDownload(env.actor, env.patient.id, document.id),
    ).rejects.toThrow("Documento nao encontrado");
  });
});
