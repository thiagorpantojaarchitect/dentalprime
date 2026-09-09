/**
 * Rotas HTTP do ai-front-desk. Todas (exceto health) exigem autenticacao. A
 * autorizacao fica nos servicos. A IA e assistiva: nao agenda nem decide
 * clinicamente. Entrada validada com Zod.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ConversationService } from "../application/conversation-service.js";
import type {
  HandoffService,
  SchedulingSuggestionService,
} from "../application/handoff-service.js";
import { requireContext } from "./auth-plugin.js";
import { sendError } from "./errors.js";

const startSchema = z.object({
  channel: z.enum(["chat", "whatsapp", "voice", "web"]),
  contactRef: z.string().nullish(),
});

const messageSchema = z.object({ content: z.string().min(1) });
const triageSchema = z.object({ text: z.string().min(1) });
const handoffSchema = z.object({ reason: z.string().min(1) });
const suggestionSchema = z.object({
  suggestedSlots: z.array(z.string().min(1)).min(1),
});
const reviewSchema = z.object({ decision: z.enum(["approved", "rejected"]) });

const conversationIdParam = z.object({ conversationId: z.string().uuid() });
const actionIdParam = z.object({ actionId: z.string().uuid() });

const validationError = { error: { code: "VALIDATION", message: "Dados invalidos." } };

export interface RouteServices {
  readonly conversations: ConversationService;
  readonly handoffs: HandoffService;
  readonly suggestions: SchedulingSuggestionService;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  services: RouteServices,
): Promise<void> {
  fastify.get("/health", async () => ({ status: "ok" }));

  // --- Conversas ---

  fastify.post(
    "/conversations",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = startSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const conversation = await services.conversations.start(
          requireContext(request),
          body.data.channel,
          body.data.contactRef ?? null,
        );
        return reply
          .status(201)
          .send({ id: conversation.id, status: conversation.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/conversations/:conversationId/messages",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = conversationIdParam.safeParse(request.params);
      const body = messageSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const result = await services.conversations.handleContactMessage(
          requireContext(request),
          params.data.conversationId,
          body.data.content,
        );
        return reply.status(201).send({
          reply: { content: result.reply.content, isAI: result.reply.isAI },
          handedOff: result.handedOff,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/conversations/:conversationId/messages",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = conversationIdParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const messages = await services.conversations.listMessages(
          requireContext(request),
          params.data.conversationId,
        );
        return reply.send({ messages });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/triage",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = triageSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const result = await services.conversations.triage(
          requireContext(request),
          body.data.text,
        );
        return reply.send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Handoff ---

  fastify.post(
    "/conversations/:conversationId/handoff",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = conversationIdParam.safeParse(request.params);
      const body = handoffSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const handoff = await services.handoffs.requestHandoff(
          requireContext(request),
          params.data.conversationId,
          body.data.reason,
          "contact",
        );
        return reply.status(201).send({ id: handoff.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Sugestoes de agendamento (assistivas) ---

  fastify.post(
    "/conversations/:conversationId/scheduling-suggestions",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = conversationIdParam.safeParse(request.params);
      const body = suggestionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const log = await services.suggestions.suggest(requireContext(request), {
          conversationId: params.data.conversationId,
          suggestedSlots: body.data.suggestedSlots,
        });
        return reply.status(201).send({ id: log.id, reviewStatus: log.reviewStatus });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/conversations/:conversationId/ai-actions",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = conversationIdParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const actions = await services.suggestions.listActions(
          requireContext(request),
          params.data.conversationId,
        );
        return reply.send({ actions });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/ai-actions/:actionId/review",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = actionIdParam.safeParse(request.params);
      const body = reviewSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        await services.suggestions.review(
          requireContext(request),
          params.data.actionId,
          body.data.decision,
        );
        return reply.status(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
