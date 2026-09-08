/**
 * Rotas HTTP do patient-record. Todas (exceto health) exigem autenticacao. A
 * autorizacao fica nos servicos de aplicacao. Entrada validada com Zod;
 * mensagens de erro genericas.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AnamnesisService } from "../application/anamnesis-service.js";
import type { ClinicalRecordService } from "../application/clinical-record-service.js";
import type { ConsentService } from "../application/consent-service.js";
import type { OdontogramService } from "../application/odontogram-service.js";
import type { PatientRightsService } from "../application/patient-rights-service.js";
import type { PatientService } from "../application/patient-service.js";
import { requireContext } from "./auth-plugin.js";
import { sendError } from "./errors.js";

const registerPatientSchema = z.object({
  fullName: z.string().min(1),
  cpf: z.string().min(1),
  birthDate: z.string().nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  address: z.record(z.unknown()).nullish(),
});

const updatePatientSchema = z.object({
  fullName: z.string().min(1).optional(),
  birthDate: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.record(z.unknown()).nullable().optional(),
  active: z.boolean().optional(),
});

const consentSchema = z.object({
  purpose: z.string().min(1),
  termVersion: z.string().min(1),
});

const clinicalEntrySchema = z.object({
  entryType: z.string().min(1),
  content: z.string().min(1),
});

const correctionSchema = z.object({ content: z.string().min(1) });

const anamnesisSchema = z.object({ answers: z.record(z.unknown()) });

const odontogramSchema = z.object({
  toothNumber: z.number().int(),
  surface: z.string().nullish(),
  condition: z.string().min(1),
  critical: z.boolean().optional(),
});

const idParam = z.object({ patientId: z.string().uuid() });
const recordKeyParam = z.object({ recordKey: z.string().uuid() });

export interface RouteServices {
  readonly patients: PatientService;
  readonly consents: ConsentService;
  readonly records: ClinicalRecordService;
  readonly anamnesis: AnamnesisService;
  readonly odontogram: OdontogramService;
  readonly rights: PatientRightsService;
}

const validationError = { error: { code: "VALIDATION", message: "Dados invalidos." } };

export async function registerRoutes(
  fastify: FastifyInstance,
  services: RouteServices,
): Promise<void> {
  fastify.get("/health", async () => ({ status: "ok" }));

  // --- Pacientes ---

  fastify.post(
    "/patients",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const body = registerPatientSchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send(validationError);
      try {
        const patient = await services.patients.register(requireContext(request), {
          fullName: body.data.fullName,
          cpf: body.data.cpf,
          birthDate: body.data.birthDate ?? null,
          email: body.data.email ?? null,
          phone: body.data.phone ?? null,
          address: body.data.address ?? null,
        });
        return reply.status(201).send({ id: patient.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/patients/:patientId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const patient = await services.patients.getById(
          requireContext(request),
          params.data.patientId,
        );
        return reply.send(patient);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.patch(
    "/patients/:patientId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      const body = updatePatientSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const patient = await services.patients.update(
          requireContext(request),
          params.data.patientId,
          body.data,
        );
        return reply.send(patient);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Consentimento ---

  fastify.post(
    "/patients/:patientId/consents/grant",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      const body = consentSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const consent = await services.consents.grant(
          requireContext(request),
          params.data.patientId,
          body.data.purpose,
          body.data.termVersion,
        );
        return reply.status(201).send({ id: consent.id, status: consent.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/patients/:patientId/consents/revoke",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      const body = consentSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const consent = await services.consents.revoke(
          requireContext(request),
          params.data.patientId,
          body.data.purpose,
          body.data.termVersion,
        );
        return reply.status(201).send({ id: consent.id, status: consent.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Prontuario clinico (versionado) ---

  fastify.post(
    "/patients/:patientId/clinical-records",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      const body = clinicalEntrySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const record = await services.records.createEntry(requireContext(request), {
          patientId: params.data.patientId,
          entryType: body.data.entryType,
          content: body.data.content,
        });
        return reply
          .status(201)
          .send({ recordKey: record.recordKey, version: record.version });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/clinical-records/:recordKey/correction",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = recordKeyParam.safeParse(request.params);
      const body = correctionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const record = await services.records.correctEntry(
          requireContext(request),
          params.data.recordKey,
          body.data.content,
        );
        return reply
          .status(201)
          .send({ recordKey: record.recordKey, version: record.version });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/patients/:patientId/clinical-records",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const records = await services.records.listForPatient(
          requireContext(request),
          params.data.patientId,
        );
        return reply.send({ records });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/clinical-records/:recordKey/history",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = recordKeyParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const versions = await services.records.history(
          requireContext(request),
          params.data.recordKey,
        );
        return reply.send({ versions });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Anamnese ---

  fastify.put(
    "/patients/:patientId/anamnesis",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      const body = anamnesisSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const anamnesis = await services.anamnesis.update(
          requireContext(request),
          params.data.patientId,
          body.data.answers,
        );
        return reply.status(201).send({ version: anamnesis.version });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/patients/:patientId/anamnesis",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const anamnesis = await services.anamnesis.current(
          requireContext(request),
          params.data.patientId,
        );
        return reply.send({ anamnesis });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Odontograma ---

  fastify.post(
    "/patients/:patientId/odontogram",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      const body = odontogramSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send(validationError);
      try {
        const entry = await services.odontogram.addEntry(requireContext(request), {
          patientId: params.data.patientId,
          toothNumber: body.data.toothNumber,
          surface: body.data.surface ?? null,
          condition: body.data.condition,
          critical: body.data.critical,
        });
        return reply.status(201).send({ id: entry.id });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/patients/:patientId/odontogram",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const entries = await services.odontogram.listForPatient(
          requireContext(request),
          params.data.patientId,
        );
        return reply.send({ entries });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Direitos do titular (LGPD) ---

  fastify.get(
    "/patients/:patientId/export",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const data = await services.rights.export(
          requireContext(request),
          params.data.patientId,
        );
        return reply.send(data);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/patients/:patientId/erasure",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = idParam.safeParse(request.params);
      if (!params.success) return reply.status(400).send(validationError);
      try {
        const outcome = await services.rights.requestErasure(
          requireContext(request),
          params.data.patientId,
        );
        return reply.send(outcome);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
