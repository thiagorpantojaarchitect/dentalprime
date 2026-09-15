/**
 * Composicao das dependencias de producao do patient-record.
 */

import { AnamnesisService } from "./application/anamnesis-service.js";
import { AuditService } from "./application/audit-service.js";
import { ClinicalRecordService } from "./application/clinical-record-service.js";
import { ConsentService } from "./application/consent-service.js";
import { DocumentService } from "./application/document-service.js";
import { OdontogramService } from "./application/odontogram-service.js";
import { PatientRightsService } from "./application/patient-rights-service.js";
import { PatientService } from "./application/patient-service.js";
import type { Config } from "./config.js";
import { AuthorizationService } from "./domain/authorization.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAnamnesisRepository,
  DrizzleAuditRepository,
  DrizzleClinicalRecordRepository,
  DrizzleClinicalDocumentRepository,
  DrizzleConsentRepository,
  DrizzleOdontogramRepository,
  DrizzlePatientRepository,
} from "./infrastructure/repositories.js";
import { S3ClinicalDocumentStore } from "./infrastructure/s3-document-store.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

export function composeProduction(config: Config): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const patientRepo = new DrizzlePatientRepository(db);
  const consentRepo = new DrizzleConsentRepository(db);
  const recordRepo = new DrizzleClinicalRecordRepository(db);
  const documentRepo = new DrizzleClinicalDocumentRepository(db);
  const anamnesisRepo = new DrizzleAnamnesisRepository(db);
  const odontogramRepo = new DrizzleOdontogramRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();
  const documentStore = new S3ClinicalDocumentStore({
    bucket: config.clinicalDocumentsBucket,
    region: config.awsRegion,
    ...(config.clinicalDocumentsEndpoint
      ? { endpoint: config.clinicalDocumentsEndpoint }
      : {}),
    forcePathStyle: config.clinicalDocumentsForcePathStyle,
  });

  const patients = new PatientService({ patients: patientRepo, audit, authorization });
  const consents = new ConsentService({
    consents: consentRepo,
    patients: patientRepo,
    audit,
    authorization,
  });
  const records = new ClinicalRecordService({
    records: recordRepo,
    patients: patientRepo,
    audit,
    authorization,
  });
  const anamnesis = new AnamnesisService({
    anamneses: anamnesisRepo,
    patients: patientRepo,
    audit,
    authorization,
  });
  const odontogram = new OdontogramService({
    odontogram: odontogramRepo,
    patients: patientRepo,
    audit,
    authorization,
  });
  const rights = new PatientRightsService({
    patients: patientRepo,
    records: recordRepo,
    audit,
    authorization,
  });
  const documents = new DocumentService({
    documents: documentRepo,
    patients: patientRepo,
    store: documentStore,
    audit,
    authorization,
    maxBytes: config.clinicalDocumentMaxBytes,
    presignedUrlTtlSeconds: config.presignedUrlTtlSeconds,
  });

  return {
    connection,
    jwtSecret: config.jwtSecret,
    patients,
    consents,
    records,
    anamnesis,
    odontogram,
    rights,
    documents,
    trustProxy: config.trustProxy,
    readinessCheck: connection.checkReady,
  };
}
