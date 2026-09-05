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
  RoleRepository,
  SessionRepository,
  UserRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import type { PasswordHasher } from "./password.js";
import type { AccessTokenClaims, TokenService } from "./tokens.js";

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
}

export class AuthService {
  constructor(private readonly deps: AuthDeps) {}

  /**
   * Autentica por email e senha no escopo do tenant. Em qualquer falha de
   * credencial retorna InvalidCredentialsError (mensagem generica) e audita a
   * tentativa.
   */
  async login(input: LoginInput): Promise<TokenPair> {
    const user = await this.deps.users.findByEmail(input.tenantId, input.email);

    // Usuario inexistente, sem senha definida ou inativo: falha generica.
    // Ainda assim verificamos a senha (quando possivel) para nao vazar timing.
    const storedHash = user?.passwordHash ?? null;
    const passwordOk = storedHash
      ? await this.deps.passwords.verify(storedHash, input.password)
      : false;

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

    const claims = await this.buildClaims(input.tenantId, user.id);
    const pair = await this.issueTokens(
      claims,
      input.tenantId,
      user.id,
      input.userAgent ?? null,
      input.ipAddress ?? null,
    );

    await this.deps.audit.record({
      tenantId: input.tenantId,
      actorUserId: user.id,
      action: "auth.login.success",
      resourceType: "session",
      ipAddress: input.ipAddress ?? null,
    });

    return pair;
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
    const session = await this.deps.sessions.findActiveByHash(tenantId, hash);
    if (!session) {
      throw new UnauthenticatedError("Sessao invalida ou expirada.");
    }

    const user = await this.deps.users.findById(tenantId, session.userId);
    if (!user || user.status !== "active") {
      await this.deps.sessions.revoke(tenantId, session.id);
      throw new UnauthenticatedError("Sessao invalida.");
    }

    // Rotaciona: revoga a sessao atual e emite uma nova.
    await this.deps.sessions.revoke(tenantId, session.id);
    const claims = await this.buildClaims(tenantId, user.id);
    return this.issueTokens(
      claims,
      tenantId,
      user.id,
      meta?.userAgent ?? null,
      meta?.ipAddress ?? null,
    );
  }

  /** Encerra uma sessao a partir do refresh token. */
  async logout(tenantId: TenantId, refreshToken: string): Promise<void> {
    const hash = this.deps.tokens.hashRefreshToken(refreshToken);
    const session = await this.deps.sessions.findActiveByHash(tenantId, hash);
    if (session) {
      await this.deps.sessions.revoke(tenantId, session.id);
      await this.deps.audit.record({
        tenantId,
        actorUserId: session.userId,
        action: "auth.logout",
        resourceType: "session",
        resourceId: session.id,
      });
    }
  }

  private async buildClaims(
    tenantId: TenantId,
    userId: string,
  ): Promise<AccessTokenClaims> {
    const assignments = await this.deps.roles.listForUser(tenantId, userId);
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
  ): Promise<TokenPair> {
    const accessToken = await this.deps.tokens.issueAccessToken(claims);
    const refresh = this.deps.tokens.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.deps.refreshTtlSeconds * 1000);
    await this.deps.sessions.create({
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
