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
import { JoseTokenService } from "./application/tokens.js";
import { UserService } from "./application/user-service.js";
import type { Config } from "./config.js";
import { createDbConnection, type DbConnection } from "./infrastructure/db/client.js";
import {
  DrizzleAuditRepository,
  DrizzleRoleRepository,
  DrizzleSessionRepository,
  DrizzleTenantRepository,
  DrizzleUnitRepository,
  DrizzleUserRepository,
} from "./infrastructure/repositories.js";
import type { AppDeps } from "./app.js";

export interface Composition extends AppDeps {
  readonly connection: DbConnection;
}

export function composeProduction(config: Config): Composition {
  const connection = createDbConnection(config.databaseUrl);
  const db = connection.db;

  const userRepo = new DrizzleUserRepository(db);
  const roleRepo = new DrizzleRoleRepository(db);
  const sessionRepo = new DrizzleSessionRepository(db);
  const auditRepo = new DrizzleAuditRepository(db);
  const tenantRepo = new DrizzleTenantRepository(db);
  const unitRepo = new DrizzleUnitRepository(db);

  const tokens = new JoseTokenService(config.jwtSecret, config.accessTokenTtlSeconds);
  const audit = new AuditService(auditRepo);
  const authorization = new AuthorizationService();

  const auth = new AuthService({
    users: userRepo,
    roles: roleRepo,
    sessions: sessionRepo,
    passwords: argon2Hasher,
    tokens,
    audit,
    refreshTtlSeconds: config.refreshTokenTtlSeconds,
  });

  const users = new UserService({
    users: userRepo,
    roles: roleRepo,
    sessions: sessionRepo,
    passwords: argon2Hasher,
    audit,
    authorization,
  });

  const network = new NetworkService({
    tenants: tenantRepo,
    units: unitRepo,
    users: userRepo,
    roles: roleRepo,
    audit,
    authorization,
  });

  return {
    connection,
    auth,
    users,
    network,
    tokens,
    loginRateLimitPerMinute: config.loginRateLimitPerMinute,
  };
}
