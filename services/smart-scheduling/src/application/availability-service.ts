/**
 * AvailabilityService: janelas de disponibilidade e bloqueios por provider.
 *
 * Define quando um provider pode atender ("available") e quando esta bloqueado
 * ("block"). O SchedulingService consulta essas janelas ao validar horarios.
 *
 * Ver `.kiro/specs/smart-scheduling/requirements.md` (Requisito 1).
 */

import type { ClinicUnitId, TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { Availability, ProviderId, ResourceId } from "../domain/models.js";
import type {
  AvailabilityRepository,
  ProviderRepository,
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

export interface AvailabilityServiceDeps {
  readonly availabilities: AvailabilityRepository;
  readonly providers: ProviderRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class AvailabilityService {
  constructor(private readonly deps: AvailabilityServiceDeps) {}

  /** Adiciona uma janela de disponibilidade ou bloqueio. Requer appointment:manage. */
  async add(actor: TenantContext, input: AddAvailabilityInput): Promise<Availability> {
    this.deps.authorization.ensure(actor, "appointment:manage", actor.tenantId);

    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw new ValidationError("Fim da janela deve ser posterior ao inicio.");
    }

    const provider = await this.deps.providers.findById(actor.tenantId, input.providerId);
    if (!provider) {
      throw new NotFoundError("Profissional nao encontrado.");
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
    providerId: ProviderId,
    startsAt: Date,
    endsAt: Date,
  ): Promise<boolean> {
    const windows = await this.deps.availabilities.listForProviderInRange(
      tenantId,
      providerId,
      startsAt,
      endsAt,
    );

    const hasBlock = windows.some(
      (w) =>
        w.kind === "block" &&
        w.startsAt.getTime() < endsAt.getTime() &&
        w.endsAt.getTime() > startsAt.getTime(),
    );
    if (hasBlock) return false;

    // O intervalo precisa estar totalmente contido em alguma janela "available".
    return windows.some(
      (w) =>
        w.kind === "available" &&
        w.startsAt.getTime() <= startsAt.getTime() &&
        w.endsAt.getTime() >= endsAt.getTime(),
    );
  }
}
