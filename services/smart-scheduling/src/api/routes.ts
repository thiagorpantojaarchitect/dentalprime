/**
 * Rotas HTTP do smart-scheduling. Todas (exceto health) exigem autenticacao. A
 * autorizacao fica nos servicos. Entrada validada com Zod; datas em ISO 8601.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AvailabilityService } from "../application/availability-service.js";
import type { ReminderService } from "../application/reminder-service.js";
import type { SchedulingService } from "../application/scheduling-service.js";
import type { WaitlistService } from "../application/waitlist-service.js";
import { requireContext } from "./auth-plugin.js";
import { sendError } from "./errors.js";

const availabilitySchema = z.object({
  providerId: z.string().uuid(),
  unitId: z.string().uuid(),
  resourceId: z.string().uuid().nullish(),
  kind: z.enum(["available", "block"]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const bookSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  unitId: z.string().uuid(),
  resourceId: z.string().uuid().nullish(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allowOverbooking: z.boolean().optional(),
});

const rescheduleSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allowOverbooking: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum(["confirmed", "attended", "no_show", "cancelled"]),
});

const reminderSchema = z.object({
  appointmentId: z.string().uuid(),
  channel: z.enum(["sms", "email", "whatsapp", "push"]),
  scheduledFor: z.string().datetime(),
});

const waitlistSchema = z.object({
  patientId: z.string().uuid(),
  unitId: z.string().uuid(),
  providerId: z.string().uuid().nullish(),
  priority: z.number().int().optional(),
});

const appointmentIdParam = z.object({ appointmentId: z.string().uuid() });
const providerIdParam = z.object({ providerId: z.string().uuid() });

const validationError = { error: { code: "VALIDATION", message: "Dados invalidos." } };

export interface RouteServices {
  readonly availability: AvailabilityService;
  readonly scheduling: SchedulingService;
  readonly reminders: ReminderService;
  readonly waitlist: WaitlistService;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  services: RouteServices,
): Promise<void> {
  fastify.get("/health", async () => ({ status: "ok" }));

  // --- Disponibilidade ---

  fastify.post(
    "/availability",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = availabilitySchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const availability = await services.availability.add(requireContext(request), {
          providerId: body.data.providerId,
          unitId: body.data.unitId,
          resourceId: body.data.resourceId ?? null,
          kind: body.data.kind,
          startsAt: new Date(body.data.startsAt),
          endsAt: new Date(body.data.endsAt),
        });
        return reply.status(201).send({ id: availability.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Agendamento ---

  fastify.post(
    "/appointments",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = bookSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const appointment = await services.scheduling.book(requireContext(request), {
          patientId: body.data.patientId,
          providerId: body.data.providerId,
          unitId: body.data.unitId,
          resourceId: body.data.resourceId ?? null,
          startsAt: new Date(body.data.startsAt),
          endsAt: new Date(body.data.endsAt),
          allowOverbooking: body.data.allowOverbooking,
        });
        return reply.status(201).send({ id: appointment.id, status: appointment.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.patch(
    "/appointments/:appointmentId/schedule",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      const body = rescheduleSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const appointment = await services.scheduling.reschedule(
          requireContext(request),
          params.data.appointmentId,
          new Date(body.data.startsAt),
          new Date(body.data.endsAt),
          body.data.allowOverbooking ?? false,
        );
        return reply.send({ id: appointment.id, startsAt: appointment.startsAt });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/appointments/:appointmentId/status",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      const body = statusSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const appointment = await services.scheduling.changeStatus(
          requireContext(request),
          params.data.appointmentId,
          body.data.status,
        );
        return reply.send({ id: appointment.id, status: appointment.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/appointments/:appointmentId/status-history",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = appointmentIdParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const history = await services.scheduling.statusHistoryFor(
          requireContext(request),
          params.data.appointmentId,
        );
        return reply.send({ history });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Lembretes ---

  fastify.post(
    "/reminders",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = reminderSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const reminder = await services.reminders.schedule(requireContext(request), {
          appointmentId: body.data.appointmentId,
          channel: body.data.channel,
          scheduledFor: new Date(body.data.scheduledFor),
        });
        return reply.status(201).send({ id: reminder.id, status: reminder.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Lista de espera / encaixe ---

  fastify.post(
    "/waitlist",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = waitlistSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const entry = await services.waitlist.add(requireContext(request), {
          patientId: body.data.patientId,
          unitId: body.data.unitId,
          providerId: body.data.providerId ?? null,
          priority: body.data.priority,
        });
        return reply.status(201).send({ id: entry.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/waitlist/suggestions/:providerId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = providerIdParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const suggestions = await services.waitlist.suggestForProvider(
          requireContext(request),
          params.data.providerId,
        );
        return reply.send({ suggestions });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
