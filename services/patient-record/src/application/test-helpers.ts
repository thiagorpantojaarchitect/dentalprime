import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  InMemoryAnamnesisRepository,
  InMemoryAuditRepository,
  InMemoryClinicalRecordRepository,
  InMemoryConsentRepository,
  InMemoryOdontogramRepository,
  InMemoryPatientRepository,
} from "../infrastructure/memory-repositories.js";
import { AnamnesisService } from "./anamnesis-service.js";
import { AuditService } from "./audit-service.js";
import { ClinicalRecordService } from "./clinical-record-service.js";
import { ConsentService } from "./consent-service.js";
import { OdontogramService } from "./odontogram-service.js";
import { PatientRightsService } from "./patient-rights-service.js";
import { PatientService } from "./patient-service.js";

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";

/** CPFs validos de teste (digitos verificadores corretos). */
export const VALID_CPF_1 = "529.982.247-25";
export const VALID_CPF_2 = "168.995.350-09";

export function makeContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: TENANT_A,
    userId: "user-1",
    roles: ["dentist"],
    units: [],
    ...overrides,
  };
}

export function buildServices() {
  const patientRepo = new InMemoryPatientRepository();
  const consentRepo = new InMemoryConsentRepository();
  const recordRepo = new InMemoryClinicalRecordRepository();
  const anamnesisRepo = new InMemoryAnamnesisRepository();
  const odontogramRepo = new InMemoryOdontogramRepository();
  const auditRepo = new InMemoryAuditRepository();

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  return {
    auditRepo,
    patients: new PatientService({ patients: patientRepo, audit, authorization }),
    consents: new ConsentService({
      consents: consentRepo,
      patients: patientRepo,
      audit,
      authorization,
    }),
    records: new ClinicalRecordService({
      records: recordRepo,
      patients: patientRepo,
      audit,
      authorization,
    }),
    anamnesis: new AnamnesisService({
      anamneses: anamnesisRepo,
      patients: patientRepo,
      audit,
      authorization,
    }),
    odontogram: new OdontogramService({
      odontogram: odontogramRepo,
      patients: patientRepo,
      audit,
      authorization,
    }),
    rights: new PatientRightsService({
      patients: patientRepo,
      records: recordRepo,
      audit,
      authorization,
    }),
  };
}
