/**
 * PatientService: cadastro, atualizacao e busca de pacientes.
 *
 * - Isolamento por tenant e autorizacao RBAC (patient:read/patient:manage).
 * - Valida CPF (regra brasileira) e impede duplicidade por tenant.
 * - Trata PII como sensivel; toda alteracao e leitura sensivel e auditada.
 *
 * Ver `.kiro/specs/patient-record/requirements.md` (Requisito 1).
 */

import type { TenantContext, UserId } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { isValidCpf, normalizeCpf } from "../domain/cpf.js";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import type { Patient, PatientId } from "../domain/models.js";
import type { PatientRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface RegisterPatientInput {
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly address?: Record<string, unknown> | null;
}

export interface UpdatePatientData {
  readonly fullName?: string | undefined;
  readonly birthDate?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly address?: Record<string, unknown> | null | undefined;
  readonly active?: boolean | undefined;
}

export interface PatientServiceDeps {
  readonly patients: PatientRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class PatientService {
  constructor(private readonly deps: PatientServiceDeps) {}

  /** Cadastra um paciente. Requer patient:manage. Valida e normaliza o CPF. */
  async register(actor: TenantContext, input: RegisterPatientInput): Promise<Patient> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);

    if (!input.fullName.trim()) {
      throw new ValidationError("Nome do paciente e obrigatorio.");
    }
    if (!isValidCpf(input.cpf)) {
      throw new ValidationError("CPF invalido.");
    }
    const cpf = normalizeCpf(input.cpf);

    const existing = await this.deps.patients.findByCpf(actor.tenantId, cpf);
    if (existing) {
      throw new ConflictError("Ja existe um paciente com este CPF no tenant.");
    }

    const patient = await this.deps.patients.create({
      tenantId: actor.tenantId,
      fullName: input.fullName.trim(),
      cpf,
      birthDate: input.birthDate ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      createdBy: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "patient.registered",
      resourceType: "patient",
      resourceId: patient.id,
    });

    return patient;
  }

  /** Busca por id. Requer patient:read. Acesso a dado sensivel e auditado. */
  async getById(actor: TenantContext, patientId: PatientId): Promise<Patient> {
    this.deps.authorization.ensure(actor, "patient:read", actor.tenantId);
    const patient = await this.deps.patients.findById(actor.tenantId, patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "patient.accessed",
      resourceType: "patient",
      resourceId: patient.id,
    });
    return patient;
  }

  /**
   * Resolve o cadastro do proprio paciente pelo sub do JWT. A permissao
   * self-read nao concede acesso por patientId e o repositorio combina tenant
   * e portalUserId, evitando IDOR entre pacientes ou tenants.
   */
  async getOwnProfile(actor: TenantContext): Promise<Patient> {
    this.deps.authorization.ensure(actor, "patient:self-read", actor.tenantId);
    const patient = await this.deps.patients.findByPortalUserId(
      actor.tenantId,
      actor.userId,
    );
    if (!patient?.active) {
      throw new NotFoundError("Cadastro de paciente nao vinculado.");
    }
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "patient.self_accessed",
      resourceType: "patient",
      resourceId: patient.id,
    });
    return patient;
  }

  /** Vincula, de forma auditada, um usuario do portal ao cadastro do paciente. */
  async linkPortalUser(
    actor: TenantContext,
    patientId: PatientId,
    portalUserId: UserId,
  ): Promise<Patient> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);

    const patient = await this.deps.patients.findById(actor.tenantId, patientId);
    if (!patient) {
      throw new NotFoundError("Paciente nao encontrado.");
    }
    const linked = await this.deps.patients.findByPortalUserId(
      actor.tenantId,
      portalUserId,
    );
    if (linked && linked.id !== patientId) {
      throw new ConflictError("Usuario do portal ja vinculado a outro paciente.");
    }
    if (patient.portalUserId === portalUserId) return patient;

    const updated = await this.deps.patients.linkPortalUser(
      actor.tenantId,
      patientId,
      portalUserId,
      actor.userId,
    );
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "patient.portal_user_linked",
      resourceType: "patient",
      resourceId: patientId,
      metadata: { replacedExistingLink: patient.portalUserId !== null },
    });
    return updated;
  }

  /** Atualiza dados cadastrais. Requer patient:manage. Auditado. */
  async update(
    actor: TenantContext,
    patientId: PatientId,
    data: UpdatePatientData,
  ): Promise<Patient> {
    this.deps.authorization.ensure(actor, "patient:manage", actor.tenantId);

    const current = await this.deps.patients.findById(actor.tenantId, patientId);
    if (!current) {
      throw new NotFoundError("Paciente nao encontrado.");
    }
    if (data.fullName !== undefined && !data.fullName.trim()) {
      throw new ValidationError("Nome do paciente e obrigatorio.");
    }

    const updated = await this.deps.patients.update(actor.tenantId, patientId, {
      ...data,
      updatedBy: actor.userId,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "patient.updated",
      resourceType: "patient",
      resourceId: patientId,
      metadata: { fields: Object.keys(data) },
    });

    return updated;
  }
}
