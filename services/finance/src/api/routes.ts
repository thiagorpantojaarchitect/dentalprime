/**
 * Rotas HTTP do finance. Todas (exceto health) exigem autenticacao. A
 * autorizacao fica nos servicos. Valores monetarios chegam como decimal string
 * ("120.00") e sao convertidos para centavos na borda.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { InvoiceService } from "../application/invoice-service.js";
import type { PaymentPlanService } from "../application/payment-plan-service.js";
import type { PaymentService } from "../application/payment-service.js";
import type { PayoutService } from "../application/payout-service.js";
import type { ReconciliationService } from "../application/reconciliation-service.js";
import { decimalToCents } from "../domain/money.js";
import { requireContext } from "./auth-plugin.js";
import { sendError } from "./errors.js";

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, "valor monetario invalido");

const createInvoiceSchema = z.object({
  patientId: z.string().uuid(),
  unitId: z.string().uuid(),
  currency: z.string().length(3).optional(),
});

const addItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  unitPrice: money,
});

const paymentSchema = z.object({
  amount: money,
  method: z.enum(["cash", "card", "pix", "boleto", "transfer"]),
  externalRef: z.string().nullish(),
});

const planSchema = z.object({
  installmentCount: z.number().int().positive(),
  firstDueDate: z.string().datetime(),
});

const payoutSchema = z.object({
  providerId: z.string().uuid(),
  invoiceItemId: z.string().uuid(),
  base: money,
  rateBasisPoints: z.number().int().min(0).max(10000),
});

const reconcileSchema = z.object({
  reference: z.string().min(1),
  expected: money,
  received: money,
});

const invoiceIdParam = z.object({ invoiceId: z.string().uuid() });
const installmentIdParam = z.object({ installmentId: z.string().uuid() });
const providerIdParam = z.object({ providerId: z.string().uuid() });

const validationError = { error: { code: "VALIDATION", message: "Dados invalidos." } };

export interface RouteServices {
  readonly invoices: InvoiceService;
  readonly payments: PaymentService;
  readonly plans: PaymentPlanService;
  readonly payouts: PayoutService;
  readonly reconciliation: ReconciliationService;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  services: RouteServices,
): Promise<void> {
  fastify.get("/health", async () => ({ status: "ok" }));

  // --- Faturas ---

  fastify.post(
    "/invoices",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = createInvoiceSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const invoice = await services.invoices.createInvoice(
          requireContext(request),
          body.data.patientId,
          body.data.unitId,
          body.data.currency,
        );
        return reply.status(201).send({ id: invoice.id, status: invoice.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/invoices/:invoiceId/items",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      const body = addItemSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const item = await services.invoices.addItem(
          requireContext(request),
          params.data.invoiceId,
          {
            description: body.data.description,
            quantity: body.data.quantity,
            unitPriceCents: decimalToCents(body.data.unitPrice),
          },
        );
        return reply.status(201).send({ id: item.id, totalCents: item.totalCents });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Pagamentos ---

  fastify.post(
    "/invoices/:invoiceId/payments",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      const body = paymentSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const result = await services.payments.register(requireContext(request), {
          invoiceId: params.data.invoiceId,
          amountCents: decimalToCents(body.data.amount),
          method: body.data.method,
          externalRef: body.data.externalRef ?? null,
        });
        return reply.status(201).send({
          paymentId: result.payment.id,
          invoiceStatus: result.invoice.status,
          balanceCents: result.invoice.balanceCents,
          idempotentReplay: result.idempotentReplay,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Parcelamento ---

  fastify.post(
    "/invoices/:invoiceId/payment-plan",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = invoiceIdParam.safeParse(request.params);
      const body = planSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const installments = await services.plans.createPlan(requireContext(request), {
          invoiceId: params.data.invoiceId,
          installmentCount: body.data.installmentCount,
          firstDueDate: new Date(body.data.firstDueDate),
        });
        return reply.status(201).send({ installments });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/installments/:installmentId/pay",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = installmentIdParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        await services.plans.markInstallmentPaid(
          requireContext(request),
          params.data.installmentId,
        );
        return reply.status(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Repasses ---

  fastify.post(
    "/payouts",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = payoutSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const payout = await services.payouts.compute(requireContext(request), {
          providerId: body.data.providerId,
          invoiceItemId: body.data.invoiceItemId,
          baseCents: decimalToCents(body.data.base),
          rateBasisPoints: body.data.rateBasisPoints,
        });
        return reply.status(201).send({ id: payout.id, amountCents: payout.amountCents });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/payouts/provider/:providerId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = providerIdParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const payouts = await services.payouts.listForProvider(
          requireContext(request),
          params.data.providerId,
        );
        return reply.send({ payouts });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Conciliacao ---

  fastify.post(
    "/reconciliations",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = reconcileSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const reconciliation = await services.reconciliation.reconcile(
          requireContext(request),
          {
            reference: body.data.reference,
            expectedCents: decimalToCents(body.data.expected),
            receivedCents: decimalToCents(body.data.received),
          },
        );
        return reply.status(201).send({
          id: reconciliation.id,
          status: reconciliation.status,
          differenceCents: reconciliation.differenceCents,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
