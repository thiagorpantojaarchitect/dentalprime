/**
 * Schema Drizzle do dominio patient-record.
 *
 * Toda tabela carrega `tenantId`. PII e dados clinicos sao sensiveis (protegidos
 * por RBAC e, em producao, criptografia KMS). O prontuario clinico
 * (`clinical_record`) e versionado por append: correcoes criam nova versao e a
 * anterior e preservada (ver `.kiro/steering/clinical-safety.md`).
 *
 * Ver `documentation/data-model.md` e `.kiro/specs/patient-record/design.md`.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Paciente. PII sensivel: nome, CPF, contato, endereco. CPF unico por tenant. */
export const patients = pgTable(
  "patient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    fullName: text("full_name").notNull(),
    // CPF armazenado apenas com digitos (normalizado). Sensivel.
    cpf: text("cpf").notNull(),
    birthDate: text("birth_date"),
    email: text("email"),
    phone: text("phone"),
    // Endereco como JSON estruturado (logradouro, cidade, uf, cep...).
    address: jsonb("address"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    uniqueIndex("patient_tenant_cpf_idx").on(table.tenantId, table.cpf),
    index("patient_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Consentimento LGPD por finalidade. Registra data, versao do termo e status.
 * Revogacao e um novo registro (status revoked), preservando historico.
 */
export const patientConsents = pgTable(
  "patient_consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    // Finalidade do tratamento de dados (ex.: "clinical_care", "billing").
    purpose: text("purpose").notNull(),
    termVersion: text("term_version").notNull(),
    status: text("status", { enum: ["granted", "revoked"] }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid("recorded_by"),
  },
  (table) => [
    index("consent_patient_purpose_idx").on(
      table.tenantId,
      table.patientId,
      table.purpose,
    ),
  ],
);

/**
 * Prontuario clinico versionado (append-only).
 *
 * Cada correcao cria uma nova linha com `version` incrementada, mantendo a
 * mesma `recordKey` (identidade logica da entrada). A linha com maior versao e
 * a atual; `supersededByVersion` marca versoes antigas. Nada e apagado.
 */
export const clinicalRecords = pgTable(
  "clinical_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    // Identidade logica da entrada clinica (estavel entre versoes).
    recordKey: uuid("record_key").notNull(),
    version: integer("version").notNull().default(1),
    // Tipo da entrada (ex.: "evolution", "diagnosis", "prescription").
    entryType: text("entry_type").notNull(),
    content: text("content").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    // Preenchido quando esta versao foi substituida por uma nova (historico).
    supersededByVersion: integer("superseded_by_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("clinical_record_key_version_idx").on(
      table.tenantId,
      table.recordKey,
      table.version,
    ),
    index("clinical_record_patient_idx").on(table.tenantId, table.patientId),
  ],
);

/** Anamnese com historico (append por versao, como o prontuario). */
export const anamneses = pgTable(
  "anamnesis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    version: integer("version").notNull().default(1),
    // Respostas estruturadas da anamnese.
    answers: jsonb("answers").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("anamnesis_patient_idx").on(table.tenantId, table.patientId)],
);

/**
 * Odontograma: condicao por dente/face. Alertas clinicos (ex.: alergia) sao
 * marcados como criticos para destaque na interface.
 */
export const odontogramEntries = pgTable(
  "odontogram_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    // Numero do dente (notacao FDI) e face (ex.: "mesial", "oclusal").
    toothNumber: integer("tooth_number").notNull(),
    surface: text("surface"),
    condition: text("condition").notNull(),
    critical: boolean("critical").notNull().default(false),
    authorUserId: uuid("author_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("odontogram_patient_idx").on(table.tenantId, table.patientId)],
);

/**
 * Documento/imagem clinica. O binario fica no S3 (com KMS); aqui guardamos
 * apenas metadados e a referencia ao objeto.
 */
export const clinicalDocuments = pgTable(
  "clinical_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    kind: text("kind").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    // Chave do objeto no S3 (nao e URL publica).
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes"),
    uploadedBy: uuid("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("document_patient_idx").on(table.tenantId, table.patientId)],
);

/** Trilha de auditoria append-only do dominio. */
export const auditLogs = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_tenant_idx").on(table.tenantId, table.createdAt)],
);
