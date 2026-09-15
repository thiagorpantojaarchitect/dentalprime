import { randomUUID } from "node:crypto";
import type { TenantContext } from "@dentalprime/core";

import { NotFoundError, ValidationError } from "../domain/errors.js";
import type {
  ClinicalDocumentRepository,
  PatientRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import type { AuthorizationService } from "../domain/authorization.js";

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/dicom",
]);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

function hasUnsafeMetadataCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      character === "/" || character === "\\" || codePoint <= 0x1f || codePoint === 0x7f
    );
  });
}

export interface ClinicalDocumentStore {
  presignUpload(input: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<string>;
  presignDownload(input: { key: string; expiresInSeconds: number }): Promise<string>;
}

export interface DocumentServiceDeps {
  readonly documents: ClinicalDocumentRepository;
  readonly patients: PatientRepository;
  readonly store: ClinicalDocumentStore;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
  readonly maxBytes: number;
  readonly presignedUrlTtlSeconds: number;
}

export class DocumentService {
  constructor(private readonly deps: DocumentServiceDeps) {}

  async createUpload(
    actor: TenantContext,
    input: {
      patientId: string;
      kind: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    },
  ): Promise<{
    readonly documentId: string;
    readonly uploadUrl: string;
    readonly expiresInSeconds: number;
    readonly requiredHeaders: Readonly<Record<string, string>>;
  }> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);
    if (!UUID.test(actor.tenantId) || !UUID.test(input.patientId)) {
      throw new ValidationError("Documento invalido.");
    }
    if (!(await this.deps.patients.findById(actor.tenantId, input.patientId))) {
      throw new NotFoundError("Paciente nao encontrado.");
    }
    this.validateFile(input);

    const storageKey = this.buildStorageKey(actor.tenantId, input.patientId);
    const uploadUrl = await this.deps.store.presignUpload({
      key: storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: this.deps.presignedUrlTtlSeconds,
    });
    const document = await this.deps.documents.create({
      tenantId: actor.tenantId,
      patientId: input.patientId,
      kind: input.kind,
      fileName: input.fileName,
      contentType: input.contentType,
      storageKey,
      sizeBytes: input.sizeBytes,
      uploadedBy: actor.userId,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "clinical_document.upload_authorized",
      resourceType: "clinical_document",
      resourceId: document.id,
      metadata: { contentType: input.contentType, sizeBytes: input.sizeBytes },
    });

    return {
      documentId: document.id,
      uploadUrl,
      expiresInSeconds: this.deps.presignedUrlTtlSeconds,
      requiredHeaders: {
        "content-type": input.contentType,
        "content-length": String(input.sizeBytes),
      },
    };
  }

  async createDownload(
    actor: TenantContext,
    patientId: string,
    documentId: string,
  ): Promise<{ readonly downloadUrl: string; readonly expiresInSeconds: number }> {
    this.deps.authorization.ensure(actor, "patient:read", actor.tenantId);
    if (!UUID.test(actor.tenantId) || !UUID.test(patientId) || !UUID.test(documentId)) {
      throw new NotFoundError("Documento nao encontrado.");
    }
    const document = await this.deps.documents.findById(
      actor.tenantId,
      patientId,
      documentId,
    );
    if (!document || !this.isOwnedKey(actor.tenantId, patientId, document.storageKey)) {
      throw new NotFoundError("Documento nao encontrado.");
    }
    const downloadUrl = await this.deps.store.presignDownload({
      key: document.storageKey,
      expiresInSeconds: this.deps.presignedUrlTtlSeconds,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "clinical_document.download_authorized",
      resourceType: "clinical_document",
      resourceId: document.id,
    });
    return { downloadUrl, expiresInSeconds: this.deps.presignedUrlTtlSeconds };
  }

  private validateFile(input: {
    kind: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }): void {
    if (
      !input.kind.trim() ||
      input.kind.length > 80 ||
      hasUnsafeMetadataCharacter(input.kind) ||
      !input.fileName.trim() ||
      input.fileName.length > 180 ||
      hasUnsafeMetadataCharacter(input.fileName) ||
      !ALLOWED_CONTENT_TYPES.has(input.contentType) ||
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes < 1 ||
      input.sizeBytes > this.deps.maxBytes
    ) {
      throw new ValidationError("Documento invalido.");
    }
  }

  private buildStorageKey(tenantId: string, patientId: string): string {
    return `tenants/${tenantId}/patients/${patientId}/${randomUUID()}`;
  }

  private isOwnedKey(tenantId: string, patientId: string, key: string): boolean {
    const parts = key.split("/");
    return (
      parts.length === 5 &&
      parts[0] === "tenants" &&
      parts[1] === tenantId &&
      parts[2] === "patients" &&
      parts[3] === patientId &&
      UUID.test(parts[4] ?? "")
    );
  }
}
