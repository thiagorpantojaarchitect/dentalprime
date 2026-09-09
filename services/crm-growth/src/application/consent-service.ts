/**
 * ConsentService (contato): consentimento de comunicacao por canal e finalidade.
 *
 * A decisao mais recente por (contato, finalidade, canal) determina a
 * elegibilidade. `isEligible` e o ponto unico de decisao usado pelas campanhas.
 * Opt-out sempre prevalece a partir do momento em que e registrado.
 *
 * Ver `.kiro/specs/crm-growth/requirements.md` (Requisito 5).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import type { Channel, ContactConsent } from "../domain/models.js";
import type { ConsentRepository } from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface ConsentServiceDeps {
  readonly consents: ConsentRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class ConsentService {
  constructor(private readonly deps: ConsentServiceDeps) {}

  /** Registra opt-in para um contato/finalidade/canal. Requer crm:manage. */
  async optIn(
    actor: TenantContext,
    contactRef: string,
    purpose: string,
    channel: Channel,
  ): Promise<ContactConsent> {
    return this.write(actor, contactRef, purpose, channel, "opt_in");
  }

  /** Registra opt-out. A partir daqui o contato fica inelegivel. Requer crm:manage. */
  async optOut(
    actor: TenantContext,
    contactRef: string,
    purpose: string,
    channel: Channel,
  ): Promise<ContactConsent> {
    return this.write(actor, contactRef, purpose, channel, "opt_out");
  }

  /**
   * Indica se um contato pode ser comunicado para a finalidade/canal.
   * Elegivel somente se a ultima decisao for opt_in. Ausencia de registro =
   * NAO elegivel (opt-in explicito e exigido).
   */
  async isEligible(
    tenantId: string,
    contactRef: string,
    purpose: string,
    channel: Channel,
  ): Promise<boolean> {
    const latest = await this.deps.consents.latest(
      tenantId,
      contactRef,
      purpose,
      channel,
    );
    return latest?.decision === "opt_in";
  }

  private async write(
    actor: TenantContext,
    contactRef: string,
    purpose: string,
    channel: Channel,
    decision: "opt_in" | "opt_out",
  ): Promise<ContactConsent> {
    this.deps.authorization.ensure(actor, "crm:manage", actor.tenantId);
    const consent = await this.deps.consents.record({
      tenantId: actor.tenantId,
      contactRef,
      purpose,
      channel,
      decision,
    });
    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: decision === "opt_in" ? "consent.opt_in" : "consent.opt_out",
      resourceType: "contact_consent",
      resourceId: consent.id,
      metadata: { contactRef, purpose, channel },
    });
    return consent;
  }
}
