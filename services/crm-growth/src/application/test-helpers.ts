import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import {
  InMemoryAuditRepository,
  InMemoryCampaignRepository,
  InMemoryConsentRepository,
  InMemoryInteractionRepository,
  InMemoryLeadRepository,
  InMemorySegmentRepository,
} from "../infrastructure/memory-repositories.js";
import { AuditService } from "./audit-service.js";
import { CampaignService, SegmentService } from "./campaign-service.js";
import { ConsentService } from "./consent-service.js";
import { InteractionService, LeadService } from "./lead-service.js";

export const TENANT_A = "11111111-1111-1111-1111-111111111111";
export const TENANT_B = "22222222-2222-2222-2222-222222222222";

export function makeContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: TENANT_A,
    userId: "user-1",
    roles: ["manager"],
    units: [],
    ...overrides,
  };
}

export function buildEnv() {
  const leadRepo = new InMemoryLeadRepository();
  const interactionRepo = new InMemoryInteractionRepository();
  const campaignRepo = new InMemoryCampaignRepository();
  const segmentRepo = new InMemorySegmentRepository();
  const consentRepo = new InMemoryConsentRepository();
  const auditRepo = new InMemoryAuditRepository();

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  const consent = new ConsentService({ consents: consentRepo, audit, authorization });

  return {
    auditRepo,
    leads: new LeadService({ leads: leadRepo, audit, authorization }),
    interactions: new InteractionService({
      interactions: interactionRepo,
      leads: leadRepo,
      audit,
      authorization,
    }),
    campaigns: new CampaignService({
      campaigns: campaignRepo,
      consent,
      audit,
      authorization,
    }),
    segments: new SegmentService({ segments: segmentRepo, audit, authorization }),
    consent,
  };
}
