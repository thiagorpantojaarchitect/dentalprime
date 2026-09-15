/**
 * AuthService: autenticacao por senha, emissao e renovacao de tokens.
 *
 * - Login valida credenciais; erro generico para nao revelar o fator que falhou.
 * - Access token JWT; refresh token opaco com apenas o hash persistido.
 * - Sessao guarda metadados; renovacao rotaciona o refresh token.
 * - Eventos de acesso sao auditados.
 *
 * Ver `.kiro/specs/identity-access/requirements.md` (Requisito 2).
 */

import type { TenantId } from "@dentalprime/core";

import { InvalidCredentialsError, UnauthenticatedError } from "../domain/errors.js";
import type {
  IdentityUnitOfWork,
  RoleRepository,
  SessionRepository,
  UserRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import type { PasswordHasher } from "./password.js";
import type { AccessTokenClaims, TokenService } from "./tokens.js";

// Hash Argon2id valido e nao secreto usado para equalizar o caminho de login
// quando usuario/senha ainda nao existe. Nunca corresponde a uma conta real.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$tR4+onpspg2XDZIc8Njifw$xrwsiNEGxN0mi/H6WUE0vAamkXmNIdHxuhJ64WVellk";

export interface LoginInput {
  readonly tenantId: TenantId;
  readonly email: string;
  readonly password: string;
  readonly userAgent?: string | null;
  readonly ipAddress?: string | null;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthDeps {
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly passwords: PasswordHasher;
  readonly tokens: TokenService;
  readonly audit: AuditService;
  readonly refreshTtlSeconds: number;
  readonly unitOfWork: IdentityUnitOfWork;
}

export class AuthService {
  constructor(private readonly deps: AuthDeps) {}

  /**
   * Autentica por email e senha no escopo do tenant. Em qualquer falha de
   * credencial retorna InvalidCredentialsError (mensagem generica) e audita a
   * tentativa.
   */
  async login(input: LoginInput): Promise<TokenPair> {
    const user = await this.deps.users.findByEmail(
      input.tenantId,
      input.email.trim().toLowerCase(),
    );

    // Usuario inexistente, sem senha definida ou inativo: falha generica. Um
    // hash Argon2id dummy mantem o mesmo caminho caro e reduz enumeracao por timing.
    const storedHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordOk = await this.deps.passwords.verify(storedHash, input.password);

    if (!user || user.status !== "active" || !passwordOk) {
      await this.deps.audit.record({
        tenantId: input.tenantId,
        actorUserId: user?.id ?? null,
        action: "auth.login.failed",
        resourceType: "session",
        ipAddress: input.ipAddress ?? null,
      });
      throw new InvalidCredentialsError();
    }

    return this.deps.unitOfWork.run(async (repositories) => {
      const claims = await this.buildClaims(input.tenantId, user.id, repositories.roles);
      const pair = await this.issueTokens(
        claims,
        input.tenantId,
        user.id,
        input.userAgent ?? null,
        input.ipAddress ?? null,
        repositories.sessions,
      );
      await repositories.audit.append({
        tenantId: input.tenantId,
        actorUserId: user.id,
        action: "auth.login.success",
        resourceType: "session",
        resourceId: null,
        metadata: null,
        ipAddress: input.ipAddress ?? null,
      });
      return pair;
    });
  }

  /**
   * Renova o par de tokens a partir de um refresh token valido, rotacionando-o
   * (revoga a sessao antiga e cria uma nova). Refresh invalido/expirado lanca
   * UnauthenticatedError.
   */
  async refresh(
    tenantId: TenantId,
    refreshToken: string,
    meta?: { userAgent?: string | null; ipAddress?: string | null },
  ): Promise<TokenPair> {
    const hash = this.deps.tokens.hashRefreshToken(refreshToken);
    const result = await this.deps.unitOfWork.run(async (repositories) => {
      const session = await repositories.sessions.consumeActiveByHash(
        tenantId,
        hash,
        new Date(),
      );
      if (!session) return { status: "invalid" as const };

      const user = await repositories.users.findById(tenantId, session.userId);
      if (!user || user.status !== "active") {
        // O consumo da sessao e confirmado, mesmo para uma conta desativada.
        return { status: "inactive" as const };
      }

      const claims = await this.buildClaims(tenantId, user.id, repositories.roles);
      const pair = await this.issueTokens(
        claims,
        tenantId,
        user.id,
        meta?.userAgent ?? null,
        meta?.ipAddress ?? null,
        repositories.sessions,
      );
      await repositories.audit.append({
        tenantId,
        actorUserId: user.id,
        action: "auth.refresh.rotated",
        resourceType: "session",
        resourceId: session.id,
        metadata: null,
        ipAddress: meta?.ipAddress ?? null,
      });
      return { status: "ok" as const, pair };
    });

    if (result.status !== "ok") {
      throw new UnauthenticatedError(
        result.status === "invalid" ? "Sessao invalida ou expirada." : "Sessao invalida.",
      );
    }
    return result.pair;
  }

  /** Encerra uma sessao a partir do refresh token. */
  async logout(tenantId: TenantId, refreshToken: string): Promise<void> {
    const hash = this.deps.tokens.hashRefreshToken(refreshToken);
    await this.deps.unitOfWork.run(async (repositories) => {
      const session = await repositories.sessions.consumeActiveByHash(
        tenantId,
        hash,
        new Date(),
      );
      if (!session) return;
      await repositories.audit.append({
        tenantId,
        actorUserId: session.userId,
        action: "auth.logout",
        resourceType: "session",
        resourceId: session.id,
        metadata: null,
        ipAddress: null,
      });
    });
  }

  private async buildClaims(
    tenantId: TenantId,
    userId: string,
    rolesRepository: RoleRepository,
  ): Promise<AccessTokenClaims> {
    const assignments = await rolesRepository.listForUser(tenantId, userId);
    const roles = [...new Set(assignments.map((a) => a.role))];
    const units = [
      ...new Set(assignments.map((a) => a.unitId).filter((u): u is string => u !== null)),
    ];
    return { sub: userId, tenantId, roles, units };
  }

  private async issueTokens(
    claims: AccessTokenClaims,
    tenantId: TenantId,
    userId: string,
    userAgent: string | null,
    ipAddress: string | null,
    sessionsRepository: SessionRepository,
  ): Promise<TokenPair> {
    const accessToken = await this.deps.tokens.issueAccessToken(claims);
    const refresh = this.deps.tokens.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.deps.refreshTtlSeconds * 1000);
    await sessionsRepository.create({
      tenantId,
      userId,
      refreshTokenHash: refresh.hash,
      expiresAt,
      userAgent,
      ipAddress,
    });
    return { accessToken, refreshToken: refresh.token };
  }
}
