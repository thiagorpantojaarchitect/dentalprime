/**
 * Rotas HTTP do crm-growth. Todas (exceto health) exigem autenticacao. A
 * autorizacao fica nos servicos. Entrada validada com Zod.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { CampaignService, SegmentService } from "../application/campaign-service.js";
import type { ConsentService } from "../application/consent-service.js";
import type { InteractionService, LeadService } from "../application/lead-service.js";
import { requireContext } from "./auth-plugin.js";
import { sendError } from "./errors.js";

const channel = z.enum(["phone", "email", "whatsapp", "in_person"]);

const leadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  source: z.string().nullish(),
});

const leadStatusSchema = z.object({
  status: z.enum(["contacted", "qualified", "lost"]),
});

const convertSchema = z.object({ patientId: z.string().uuid() });

const interactionSchema = z.object({
  leadId: z.string().uuid().nullish(),
  patientId: z.string().uuid().nullish(),
  kind: z.string().min(1),
  channel,
  note: z.string().nullish(),
});

const campaignSchema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  channel,
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
});

const audienceSchema = z.object({
  candidateContactRefs: z.array(z.string().min(1)),
});

const segmentSchema = z.object({
  name: z.string().min(1),
  criteria: z.record(z.unknown()),
});

const consentSchema = z.object({
  contactRef: z.string().min(1),
  purpose: z.string().min(1),
  channel,
});

const leadIdParam = z.object({ leadId: z.string().uuid() });
const campaignIdParam = z.object({ campaignId: z.string().uuid() });

const validationError = { error: { code: "VALIDATION", message: "Dados invalidos." } };

export interface RouteServices {
  readonly leads: LeadService;
  readonly interactions: InteractionService;
  readonly campaigns: CampaignService;
  readonly segments: SegmentService;
  readonly consent: ConsentService;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  services: RouteServices,
): Promise<void> {
  fastify.get("/health", async () => ({ status: "ok" }));

  // --- Leads ---

  fastify.post("/leads", { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = leadSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(validationError);
    try {
      const lead = await services.leads.create(requireContext(request), {
        name: body.data.name,
        email: body.data.email ?? null,
        phone: body.data.phone ?? null,
        source: body.data.source ?? null,
      });
      return reply.status(201).send({ id: lead.id, status: lead.status });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post(
    "/leads/:leadId/status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = leadIdParam.safeParse(request.params);
      const body = leadStatusSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const lead = await services.leads.changeStatus(
          requireContext(request),
          params.data.leadId,
          body.data.status,
        );
        return reply.send({ id: lead.id, status: lead.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/leads/:leadId/convert",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = leadIdParam.safeParse(request.params);
      const body = convertSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const lead = await services.leads.convert(
          requireContext(request),
          params.data.leadId,
          body.data.patientId,
        );
        return reply.send({
          id: lead.id,
          status: lead.status,
          patientId: lead.patientId,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Interacoes ---

  fastify.post(
    "/interactions",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = interactionSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const interaction = await services.interactions.register(
          requireContext(request),
          {
            leadId: body.data.leadId ?? null,
            patientId: body.data.patientId ?? null,
            kind: body.data.kind,
            channel: body.data.channel,
            note: body.data.note ?? null,
          },
        );
        return reply.status(201).send({ id: interaction.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/leads/:leadId/interactions",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = leadIdParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const interactions = await services.interactions.listForLead(
          requireContext(request),
          params.data.leadId,
        );
        return reply.send({ interactions });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Campanhas e segmentos ---

  fastify.post(
    "/campaigns",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = campaignSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const campaign = await services.campaigns.create(requireContext(request), {
          name: body.data.name,
          purpose: body.data.purpose,
          channel: body.data.channel,
          startsAt: body.data.startsAt ? new Date(body.data.startsAt) : null,
          endsAt: body.data.endsAt ? new Date(body.data.endsAt) : null,
        });
        return reply.status(201).send({ id: campaign.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/campaigns/:campaignId/audience",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = campaignIdParam.safeParse(request.params);
      const body = audienceSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const result = await services.campaigns.selectAudience(
          requireContext(request),
          params.data.campaignId,
          body.data.candidateContactRefs,
        );
        return reply.send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/segments",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = segmentSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const segment = await services.segments.create(
          requireContext(request),
          body.data.name,
          body.data.criteria,
        );
        return reply.status(201).send({ id: segment.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Consentimento / opt-out ---

  fastify.post(
    "/consent/opt-in",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = consentSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const consent = await services.consent.optIn(
          requireContext(request),
          body.data.contactRef,
          body.data.purpose,
          body.data.channel,
        );
        return reply.status(201).send({ id: consent.id, decision: consent.decision });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/consent/opt-out",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = consentSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const consent = await services.consent.optOut(
          requireContext(request),
          body.data.contactRef,
          body.data.purpose,
          body.data.channel,
        );
        return reply.status(201).send({ id: consent.id, decision: consent.decision });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
