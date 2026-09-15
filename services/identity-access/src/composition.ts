/**
 * Composicao das dependencias de producao (raiz de composicao).
 *
 * Liga configuracao, banco (Drizzle) e servicos de aplicacao. Isola a criacao
 * de dependencias concretas em um unico ponto.
 */

import { AuthService } from "./application/auth-service.js";
import { AuthorizationService } from "./application/authorization-service.js";
import { AuditService } from "./application/audit-service.js";
import { NetworkService } from "./application/network-service.js";
import { argon2Hasher } from "./application/password.js";
import { secureInvitationTokens } from "./application/invitation-token.js";
import { JoseTokenService } from "./application/tokens.js";
import { UserService } from "./application/user-service.js";
import type { Config } from "./config.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAuditRepository,
  DrizzleIdentityUnitOfWork,
  DrizzleInvitationRepository,
  DrizzleRoleRepository,
  DrizzleSessionRepository,
  DrizzleTenantRepository,
  DrizzleUnitRepository,
  DrizzleUserRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";
import {
  createRateLimitRedisClient,
  type RateLimitRedisClient,
} from "./infrastructure/redis-rate-limit.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
  readonly rateLimitRedis?: RateLimitRedisClient;
}

export async function composeProduction(config: Config): Promise<Composition> {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const userRepo = new DrizzleUserRepository(db);
  const roleRepo = new DrizzleRoleRepository(db);
  const sessionRepo = new DrizzleSessionRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);
  const invitationRepo = new DrizzleInvitationRepository(db);
  const tenantRepo = new DrizzleTenantRepository(db);
  const unitRepo = new DrizzleUnitRepository(db);
  const unitOfWork = new DrizzleIdentityUnitOfWork(db);

  const tokens = new JoseTokenService(config.jwtSecret, config.accessTokenTtlSeconds);
  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();
  const rateLimitRedis = config.redisUrl
    ? await createRateLimitRedisClient(config.redisUrl, config.redisAuthToken)
    : undefined;
  const readinessCheck = async (): Promise<void> => {
    await connection.checkReady();
    await rateLimitRedis?.ping();
  };

  const auth = new AuthService({
    users: userRepo,
    roles: roleRepo,
    sessions: sessionRepo,
    passwords: argon2Hasher,
    tokens,
    audit,
    refreshTtlSeconds: config.refreshTokenTtlSeconds,
    unitOfWork,
  });

  const users = new UserService({
    users: userRepo,
    invitations: invitationRepo,
    roles: roleRepo,
    sessions: sessionRepo,
    passwords: argon2Hasher,
    audit,
    authorization,
    invitationTokens: secureInvitationTokens,
    invitationTtlSeconds: config.invitationTtlSeconds,
    unitOfWork,
  });

  const network = new NetworkService({
    tenants: tenantRepo,
    units: unitRepo,
    users: userRepo,
    roles: roleRepo,
    invitations: invitationRepo,
    audit,
    authorization,
    invitationTokens: secureInvitationTokens,
    invitationTtlSeconds: config.invitationTtlSeconds,
    unitOfWork,
  });

  return {
    connection,
    auth,
    users,
    network,
    tokens,
    loginRateLimitPerMinute: config.loginRateLimitPerMinute,
    trustProxy: config.trustProxy,
    readinessCheck,
    ...(rateLimitRedis ? { rateLimitRedis } : {}),
  };
}
