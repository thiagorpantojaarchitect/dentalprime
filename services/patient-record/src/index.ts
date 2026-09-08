export { buildApp, type AppDeps } from "./app.js";
export { composeProduction, type Composition } from "./composition.js";
export { loadConfig, type Config } from "./config.js";

export { PatientService } from "./application/patient-service.js";
export { ConsentService } from "./application/consent-service.js";
export { ClinicalRecordService } from "./application/clinical-record-service.js";
export { AnamnesisService } from "./application/anamnesis-service.js";
export { OdontogramService } from "./application/odontogram-service.js";
export { PatientRightsService } from "./application/patient-rights-service.js";
export { AuditService } from "./application/audit-service.js";

export { AuthorizationService } from "./domain/authorization.js";
export { isValidCpf, normalizeCpf } from "./domain/cpf.js";
export * from "./domain/errors.js";
