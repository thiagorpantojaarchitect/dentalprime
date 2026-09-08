/**
 * Rotas HTTP do treatment-plan. Todas (exceto health) exigem autenticacao. A
 * autorizacao fica nos servicos. Entrada validada com Zod.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AcceptanceService } from "../application/acceptance-service.js";
import type { PlanItemService } from "../application/plan-item-service.js";
import type { ProcedureCatalogService } from "../application/procedure-catalog-service.js";
import type { TreatmentPlanService } from "../application/treatment-plan-service.js";
import { requireContext } from "./auth-plugin.js";
import { sendError } from "./errors.js";

const moneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, "valor monetario invalido");

const procedureSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  baseCost: moneyString,
  licensedCode: z.string().nullish(),
});

const planSchema = z.object({
  patientId: z.string().uuid(),
  title: z.string().min(1),
});

const reviseSchema = z.object({ title: z.string().min(1) });

const planStatusSchema = z.object({
  status: z.enum(["draft", "active", "completed", "cancelled"]),
});

const itemSchema = z.object({
  procedureId: z.string().uuid(),
  phase: z.number().int().positive().optional(),
  orderInPhase: z.number().int().nonnegative().optional(),
  dependsOnItemId: z.string().uuid().nullish(),
  estimatedCost: moneyString.nullish(),
});

const itemStatusSchema = z.object({
  status: z.enum(["accepted", "in_progress", "completed", "cancelled"]),
});

const decisionSchema = z.object({
  decision: z.enum(["accepted", "declined", "deferred"]),
  note: z.string().nullish(),
});

const planKeyParam = z.object({ planKey: z.string().uuid() });
const itemIdParam = z.object({ itemId: z.string().uuid() });
const planItemParam = z.object({
  planKey: z.string().uuid(),
  itemId: z.string().uuid(),
});

const validationError = { error: { code: "VALIDATION", message: "Dados invalidos." } };

export interface RouteServices {
  readonly procedures: ProcedureCatalogService;
  readonly plans: TreatmentPlanService;
  readonly items: PlanItemService;
  readonly acceptance: AcceptanceService;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  services: RouteServices,
): Promise<void> {
  fastify.get("/health", async () => ({ status: "ok" }));

  // --- Catalogo de procedimentos ---

  fastify.post(
    "/procedures",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = procedureSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const procedure = await services.procedures.create(requireContext(request), {
          name: body.data.name,
          description: body.data.description ?? null,
          baseCost: body.data.baseCost,
          licensedCode: body.data.licensedCode ?? null,
        });
        return reply.status(201).send({ id: procedure.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/procedures",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const procedures = await services.procedures.listActive(requireContext(request));
        return reply.send({ procedures });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Planos ---

  fastify.post("/plans", { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = planSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(validationError);
    try {
      const plan = await services.plans.create(
        requireContext(request),
        body.data.patientId,
        body.data.title,
      );
      return reply.status(201).send({ planKey: plan.planKey, version: plan.version });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post(
    "/plans/:planKey/revise",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      const body = reviseSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const plan = await services.plans.revise(
          requireContext(request),
          params.data.planKey,
          body.data.title,
        );
        return reply.status(201).send({ planKey: plan.planKey, version: plan.version });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/plans/:planKey/status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      const body = planStatusSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const plan = await services.plans.setStatus(
          requireContext(request),
          params.data.planKey,
          body.data.status,
        );
        return reply.send({ planKey: plan.planKey, status: plan.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/plans/:planKey",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const plan = await services.plans.current(
          requireContext(request),
          params.data.planKey,
        );
        return reply.send(plan);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/plans/:planKey/history",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const versions = await services.plans.history(
          requireContext(request),
          params.data.planKey,
        );
        return reply.send({ versions });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Itens do plano ---

  fastify.post(
    "/plans/:planKey/items",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      const body = itemSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const item = await services.items.addItem(requireContext(request), {
          planKey: params.data.planKey,
          procedureId: body.data.procedureId,
          phase: body.data.phase,
          orderInPhase: body.data.orderInPhase,
          dependsOnItemId: body.data.dependsOnItemId ?? null,
          estimatedCost: body.data.estimatedCost ?? null,
        });
        return reply.status(201).send({ id: item.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/plans/:planKey/items",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const items = await services.items.listForCurrentPlan(
          requireContext(request),
          params.data.planKey,
        );
        return reply.send({ items });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/items/:itemId/status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = itemIdParam.safeParse(request.params);
      const body = itemStatusSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const item = await services.items.changeStatus(
          requireContext(request),
          params.data.itemId,
          body.data.status,
        );
        return reply.send({ id: item.id, status: item.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Aceitacao de casos ---

  fastify.post(
    "/plans/:planKey/decision",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      const body = decisionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const acceptance = await services.acceptance.decidePlan(
          requireContext(request),
          params.data.planKey,
          body.data.decision,
          body.data.note ?? null,
        );
        return reply
          .status(201)
          .send({ id: acceptance.id, decision: acceptance.decision });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/plans/:planKey/items/:itemId/decision",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planItemParam.safeParse(request.params);
      const body = decisionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const acceptance = await services.acceptance.decideItem(
          requireContext(request),
          params.data.planKey,
          params.data.itemId,
          body.data.decision,
          body.data.note ?? null,
        );
        return reply
          .status(201)
          .send({ id: acceptance.id, decision: acceptance.decision });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/plans/:planKey/decisions",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = planKeyParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const decisions = await services.acceptance.history(
          requireContext(request),
          params.data.planKey,
        );
        return reply.send({ decisions });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
