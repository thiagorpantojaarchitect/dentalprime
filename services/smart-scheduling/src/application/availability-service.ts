/**
 * AvailabilityService: janelas de disponibilidade e bloqueios por provider.
 *
 * Define quando um provider pode atender ("available") e quando esta bloqueado
 * ("block"). O SchedulingService consulta essas janelas ao validar horarios.
 *
 * Ver `.kiro/specs/smart-scheduling/requirements.md` (Requisito 1).
 */

import type { ClinicUnitId, TenantContext, UserId } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type {
  Availability,
  Provider,
  ProviderId,
  Resource,
  ResourceId,
} from "../domain/models.js";
import type {
  AvailabilityRepository,
  ProviderRepository,
  ResourceRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface AddAvailabilityInput {
  readonly providerId: ProviderId;
  readonly unitId: ClinicUnitId;
  readonly resourceId?: ResourceId | null;
  readonly kind: "available" | "block";
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface CreateProviderInput {
  readonly unitId: ClinicUnitId;
  readonly userId: UserId;
  readonly displayName: string;
}

export interface CreateResourceInput {
  readonly unitId: ClinicUnitId;
  readonly name: string;
  readonly kind: string;
}

export interface AvailabilityServiceDeps {
  readonly availabilities: AvailabilityRepository;
  readonly providers: ProviderRepository;
  readonly resources: ResourceRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class AvailabilityService {
  constructor(private readonly deps: AvailabilityServiceDeps) {}

  /** Cadastra um profissional agendavel na unidade. */
  async createProvider(
    actor: TenantContext,
    input: CreateProviderInput,
  ): Promise<Provider> {
    this.deps.authorization.ensureUnit(
      actor,
      "appointment:manage",
      actor.tenantId,
      input.unitId,
    );
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new ValidationError("Nome do profissional e obrigatorio.");
    }

    const provider = await this.deps.providers.create({
      tenantId: actor.tenantId,
      unitId: input.unitId,
      userId: input.userId,
      displayName,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "provider.created",
      resourceType: "provider",
      resourceId: provider.id,
    });
    return provider;
  }

  /** Lista somente profissionais da unidade e do tenant solicitados. */
  async listProviders(actor: TenantContext, unitId: ClinicUnitId): Promise<Provider[]> {
    this.deps.authorization.ensureUnit(actor, "appointment:read", actor.tenantId, unitId);
    return this.deps.providers.listByUnit(actor.tenantId, unitId);
  }

  /** Cadastra cadeira, sala ou equipamento agendavel na unidade. */
  async createResource(
    actor: TenantContext,
    input: CreateResourceInput,
  ): Promise<Resource> {
    this.deps.authorization.ensureUnit(
      actor,
      "appointment:manage",
      actor.tenantId,
      input.unitId,
    );
    const name = input.name.trim();
    const kind = input.kind.trim();
    if (!name || !kind) {
      throw new ValidationError("Nome e tipo do recurso sao obrigatorios.");
    }

    const resource = await this.deps.resources.create({
      tenantId: actor.tenantId,
      unitId: input.unitId,
      name,
      kind,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "resource.created",
      resourceType: "resource",
      resourceId: resource.id,
    });
    return resource;
  }

  /** Lista somente recursos da unidade e do tenant solicitados. */
  async listResources(actor: TenantContext, unitId: ClinicUnitId): Promise<Resource[]> {
    this.deps.authorization.ensureUnit(actor, "appointment:read", actor.tenantId, unitId);
    return this.deps.resources.listByUnit(actor.tenantId, unitId);
  }

  /** Adiciona uma janela de disponibilidade ou bloqueio. Requer appointment:manage. */
  async add(actor: TenantContext, input: AddAvailabilityInput): Promise<Availability> {
    this.deps.authorization.ensureUnit(
      actor,
      "appointment:manage",
      actor.tenantId,
      input.unitId,
    );

    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw new ValidationError("Fim da janela deve ser posterior ao inicio.");
    }

    const provider = await this.deps.providers.findById(actor.tenantId, input.providerId);
    if (!provider) {
      throw new NotFoundError("Profissional nao encontrado.");
    }
    if (provider.unitId !== input.unitId) {
      throw new NotFoundError("Profissional nao encontrado nesta unidade.");
    }
    if (input.resourceId) {
      const resource = await this.deps.resources.findById(
        actor.tenantId,
        input.resourceId,
      );
      if (!resource || resource.unitId !== input.unitId) {
        throw new NotFoundError("Recurso nao encontrado nesta unidade.");
      }
    }

    const availability = await this.deps.availabilities.add({
      tenantId: actor.tenantId,
      unitId: input.unitId,
      providerId: input.providerId,
      resourceId: input.resourceId ?? null,
      kind: input.kind,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "availability.added",
      resourceType: "availability",
      resourceId: availability.id,
    });

    return availability;
  }

  /**
   * Verifica se um intervalo esta dentro de uma janela "available" e fora de
   * qualquer "block". Usado pelo SchedulingService.
   */
  async isWithinAvailability(
    tenantId: string,
    unitId: ClinicUnitId,
    providerId: ProviderId,
    resourceId: ResourceId | null,
    startsAt: Date,
    endsAt: Date,
  ): Promise<boolean> {
    const windows = await this.deps.availabilities.listForProviderInRange(
      tenantId,
      unitId,
      providerId,
      startsAt,
      endsAt,
    );

    const appliesToResource = (window: Availability): boolean =>
      window.resourceId === null || window.resourceId === resourceId;

    const hasBlock = windows.some(
      (w) =>
        appliesToResource(w) &&
        w.kind === "block" &&
        w.startsAt.getTime() < endsAt.getTime() &&
        w.endsAt.getTime() > startsAt.getTime(),
    );
    if (hasBlock) return false;

    // O intervalo precisa estar totalmente contido em alguma janela "available".
    return windows.some(
      (w) =>
        appliesToResource(w) &&
        w.kind === "available" &&
        w.startsAt.getTime() <= startsAt.getTime() &&
        w.endsAt.getTime() >= endsAt.getTime(),
    );
  }
}
