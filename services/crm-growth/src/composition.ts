/**
 * Composicao das dependencias de producao do crm-growth.
 */

import { AuditService } from "./application/audit-service.js";
import { CampaignService, SegmentService } from "./application/campaign-service.js";
import { ConsentService } from "./application/consent-service.js";
import { InteractionService, LeadService } from "./application/lead-service.js";
import type { Config } from "./config.js";
import { AuthorizationService } from "./domain/authorization.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAuditRepository,
  DrizzleCampaignRepository,
  DrizzleConsentRepository,
  DrizzleInteractionRepository,
  DrizzleLeadRepository,
  DrizzleSegmentRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

export function composeProduction(config: Config): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const leadRepo = new DrizzleLeadRepository(db);
  const interactionRepo = new DrizzleInteractionRepository(db);
  const campaignRepo = new DrizzleCampaignRepository(db);
  const segmentRepo = new DrizzleSegmentRepository(db);
  const consentRepo = new DrizzleConsentRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);

  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  const leads = new LeadService({ leads: leadRepo, audit, authorization });
  const interactions = new InteractionService({
    interactions: interactionRepo,
    leads: leadRepo,
    audit,
    authorization,
  });
  const consent = new ConsentService({ consents: consentRepo, audit, authorization });
  const campaigns = new CampaignService({
    campaigns: campaignRepo,
    consent,
    audit,
    authorization,
  });
  const segments = new SegmentService({ segments: segmentRepo, audit, authorization });

  return {
    connection,
    jwtSecret: config.jwtSecret,
    leads,
    interactions,
    campaigns,
    segments,
    consent,
  };
}
