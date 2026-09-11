/**
 * Rotas HTTP do identity-access.
 *
 * Entrada validada com Zod. Rotas protegidas usam `authenticate` e a decisao de
 * autorizacao fica nos servicos de aplicacao (ponto unico). Mensagens de erro
 * sao genericas.
 */

import type { Role } from "@dentalprime/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../application/auth-service.js";
import type { NetworkService } from "../application/network-service.js";
import type { UserService } from "../application/user-service.js";
import { requireContext } from "./auth-plugin.js";
import { sendError } from "./errors.js";

const ROLES: readonly [Role, ...Role[]] = [
  "owner",
  "manager",
  "dentist",
  "specialist",
  "assistant",
  "front-desk",
  "patient",
];

const loginSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  tenantId: z.string().uuid(),
  refreshToken: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.enum(ROLES),
  unitId: z.string().uuid().nullish(),
});

const activateSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  password: z.string().min(8),
});

const changeRoleSchema = z.object({
  role: z.enum(ROLES),
  unitId: z.string().uuid().nullable(),
});

const provisionTenantSchema = z.object({
  name: z.string().min(1),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1),
});

const createUnitSchema = z.object({ name: z.string().min(1) });

const unitIdParam = z.object({ unitId: z.string().uuid() });

export interface RouteDeps {
  readonly auth: AuthService;
  readonly users: UserService;
  readonly network: NetworkService;
  readonly loginRateLimitPerMinute: number;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  fastify.get("/health", async () => ({ status: "ok" }));

  // --- Autenticacao ---

  fastify.post(
    "/auth/login",
    {
      config: {
        rateLimit: { max: deps.loginRateLimitPerMinute, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
      }
      try {
        const pair = await deps.auth.login({
          tenantId: parsed.data.tenantId,
          email: parsed.data.email,
          password: parsed.data.password,
          userAgent: request.headers["user-agent"] ?? null,
          ipAddress: request.ip,
        });
        return reply.send(pair);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
    }
    try {
      const pair = await deps.auth.refresh(
        parsed.data.tenantId,
        parsed.data.refreshToken,
        {
          userAgent: request.headers["user-agent"] ?? null,
          ipAddress: request.ip,
        },
      );
      return reply.send(pair);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
    }
    try {
      await deps.auth.logout(parsed.data.tenantId, parsed.data.refreshToken);
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --- Ativacao de conta (publica, valida userId+tenantId+senha) ---

  fastify.post("/users/activate", async (request, reply) => {
    const parsed = activateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
    }
    try {
      await deps.users.activate(
        parsed.data.tenantId,
        parsed.data.userId,
        parsed.data.password,
      );
      return reply.status(204).send();
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // --- Gestao de usuarios (protegida) ---

  fastify.post(
    "/users/invite",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const parsed = inviteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
      }
      try {
        const actor = requireContext(request);
        const user = await deps.users.invite(actor, {
          email: parsed.data.email,
          displayName: parsed.data.displayName,
          role: parsed.data.role,
          unitId: parsed.data.unitId ?? null,
        });
        return reply.status(201).send({ id: user.id, status: user.status });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/users/:userId/deactivate",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
      }
      try {
        const actor = requireContext(request);
        await deps.users.deactivate(actor, params.data.userId);
        return reply.status(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post(
    "/users/:userId/role",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
      const body = changeRoleSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
      }
      try {
        const actor = requireContext(request);
        await deps.users.changeRole(
          actor,
          params.data.userId,
          body.data.role,
          body.data.unitId,
        );
        return reply.status(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  // --- Rede: tenants, unidades e visao de usuarios (admin-portal) ---

  fastify.post(
    "/tenants",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const parsed = provisionTenantSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
      }
      try {
        const result = await deps.network.provisionTenant(requireContext(request), {
          name: parsed.data.name,
          ownerEmail: parsed.data.ownerEmail,
          ownerName: parsed.data.ownerName,
        });
        return reply.status(201).send({
          id: result.tenant.id,
          name: result.tenant.name,
          ownerUserId: result.ownerUserId,
        });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/tenants",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const tenants = await deps.network.listTenants(requireContext(request));
        return reply.send({ tenants });
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get(
    "/tenants/current",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      try {
        const tenant = await deps.network.currentTenant(requireContext(request));
        return reply.send(tenant);
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.post("/units", { preHandler: fastify.authenticate }, async (request, reply) => {
    const parsed = createUnitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
    }
    try {
      const unit = await deps.network.createUnit(
        requireContext(request),
        parsed.data.name,
      );
      return reply
        .status(201)
        .send({ id: unit.id, name: unit.name, active: unit.active });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.get("/units", { preHandler: fastify.authenticate }, async (request, reply) => {
    try {
      const units = await deps.network.listUnits(requireContext(request));
      return reply.send({ units });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post(
    "/units/:unitId/deactivate",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const params = unitIdParam.safeParse(request.params);
      if (!params.success) {
        return reply
          .status(400)
          .send({ error: { code: "VALIDATION", message: "Dados invalidos." } });
      }
      try {
        await deps.network.setUnitActive(
          requireContext(request),
          params.data.unitId,
          false,
        );
        return reply.status(204).send();
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  fastify.get("/users", { preHandler: fastify.authenticate }, async (request, reply) => {
    try {
      const users = await deps.network.listUsers(requireContext(request));
      return reply.send({ users });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
