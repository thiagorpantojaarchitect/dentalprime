/**
 * UserService: gestao de usuarios e papeis.
 *
 * Convite (cria usuario pendente), ativacao (define senha e ativa),
 * desativacao (bloqueia e encerra sessoes) e troca de papel. Toda alteracao de
 * papel/permissao e auditada.
 *
 * Ver `.kiro/specs/identity-access/requirements.md` (Requisitos 4 e 5).
 */

import type {
  ClinicUnitId,
  Role,
  TenantContext,
  TenantId,
  UserId,
} from "@dentalprime/core";

import {
  ConflictError,
  InvalidCredentialsError,
  NotFoundError,
} from "../domain/errors.js";
import type { User } from "../domain/models.js";
import type {
  InvitationRepository,
  IdentityUnitOfWork,
  RoleRepository,
  SessionRepository,
  UserRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { AuthorizationService } from "./authorization-service.js";
import type { PasswordHasher } from "./password.js";
import type { InvitationTokenService } from "./invitation-token.js";

export interface InviteUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly unitId?: ClinicUnitId | null;
}

export interface UserServiceDeps {
  readonly users: UserRepository;
  readonly invitations: InvitationRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly passwords: PasswordHasher;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
  readonly invitationTokens: InvitationTokenService;
  readonly invitationTtlSeconds: number;
  readonly unitOfWork: IdentityUnitOfWork;
}

export interface InvitedUser extends User {
  /** Returned once to the authorized inviter; only its SHA-256 hash is stored. */
  readonly activationToken: string;
  readonly activationExpiresAt: Date;
}

export class UserService {
  constructor(private readonly deps: UserServiceDeps) {}

  /**
   * Convida um usuario: cria em estado pendente e atribui o papel inicial.
   * Requer permissao user:invite no tenant do ator.
   */
  async invite(actor: TenantContext, input: InviteUserInput): Promise<InvitedUser> {
    this.deps.authorization.ensure(actor, "user:invite", { tenantId: actor.tenantId });
    this.deps.authorization.ensure(actor, "role:assign", { tenantId: actor.tenantId });
    const normalizedEmail = input.email.trim().toLowerCase();
    const activationToken = this.deps.invitationTokens.generate();
    const activationExpiresAt = new Date(
      Date.now() + this.deps.invitationTtlSeconds * 1000,
    );
    const tokenHash = this.deps.invitationTokens.hash(activationToken);

    return this.deps.unitOfWork.run(async (repositories) => {
      const existing = await repositories.users.findByEmail(
        actor.tenantId,
        normalizedEmail,
      );
      if (existing) {
        throw new ConflictError("Ja existe um usuario com este email no tenant.");
      }

      const user = await repositories.users.create({
        tenantId: actor.tenantId,
        email: normalizedEmail,
        displayName: input.displayName,
        passwordHash: null,
        status: "pending",
      });
      await repositories.roles.assign(
        actor.tenantId,
        user.id,
        input.role,
        input.unitId ?? null,
      );
      await repositories.invitations.create({
        tenantId: actor.tenantId,
        userId: user.id,
        tokenHash,
        expiresAt: activationExpiresAt,
        createdByUserId: actor.userId,
      });
      await repositories.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "user.invited",
        resourceType: "user",
        resourceId: user.id,
        metadata: { role: input.role, unitId: input.unitId ?? null },
        ipAddress: null,
      });

      return { ...user, activationToken, activationExpiresAt };
    });
  }

  /**
   * Ativa um usuario pendente definindo sua senha. Fluxo normalmente disparado
   * pelo proprio convidado a partir de um token de convite (validado na API).
   */
  async activate(
    tenantId: TenantId,
    activationToken: string,
    password: string,
  ): Promise<void> {
    // Argon2 roda antes de abrir a transacao. Se o hash falhar, o convite
    // permanece intacto e pode ser tentado novamente.
    const passwordHash = await this.deps.passwords.hash(password);
    const tokenHash = this.deps.invitationTokens.hash(activationToken);

    await this.deps.unitOfWork.run(async (repositories) => {
      const invitation = await repositories.invitations.consumeActive(
        tenantId,
        tokenHash,
        new Date(),
      );
      if (!invitation) {
        throw new NotFoundError("Convite invalido ou expirado.");
      }

      const activated = await repositories.users.activatePending(
        tenantId,
        invitation.userId,
        passwordHash,
      );
      if (!activated) {
        // O throw reverte tambem o usedAt do convite na implementacao Drizzle.
        throw new ConflictError("Conta ja ativada ou indisponivel.");
      }

      await repositories.audit.append({
        tenantId,
        actorUserId: invitation.userId,
        action: "user.activated",
        resourceType: "user",
        resourceId: invitation.userId,
        metadata: null,
        ipAddress: null,
      });
    });
  }

  /**
   * Troca a propria senha, revoga refresh tokens e audita a operacao. Access
   * tokens ja emitidos expiram conforme ACCESS_TOKEN_TTL_SECONDS; revogacao
   * imediata cross-service exige introspeccao/denylist compartilhada.
   */
  async changeOwnPassword(
    actor: TenantContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.deps.users.findById(actor.tenantId, actor.userId);
    if (
      !user ||
      user.status !== "active" ||
      !user.passwordHash ||
      !(await this.deps.passwords.verify(user.passwordHash, currentPassword))
    ) {
      throw new InvalidCredentialsError();
    }
    if (await this.deps.passwords.verify(user.passwordHash, newPassword)) {
      throw new ConflictError("A nova senha deve ser diferente da senha atual.");
    }

    const newPasswordHash = await this.deps.passwords.hash(newPassword);
    await this.deps.unitOfWork.run(async (repositories) => {
      const changed = await repositories.users.setPasswordHashIfCurrent(
        actor.tenantId,
        actor.userId,
        user.passwordHash!,
        newPasswordHash,
      );
      if (!changed) throw new InvalidCredentialsError();

      await repositories.sessions.revokeAllForUser(actor.tenantId, actor.userId);
      await repositories.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "user.password_changed",
        resourceType: "user",
        resourceId: actor.userId,
        metadata: null,
        ipAddress: null,
      });
    });
  }

  /** Desativa o usuario e revoga seus refresh tokens em uma transacao. */
  async deactivate(actor: TenantContext, userId: UserId): Promise<void> {
    this.deps.authorization.ensure(actor, "user:manage", { tenantId: actor.tenantId });

    await this.deps.unitOfWork.run(async (repositories) => {
      const user = await repositories.users.findById(actor.tenantId, userId);
      if (!user) {
        throw new NotFoundError("Usuario nao encontrado.");
      }
      await repositories.users.setStatus(actor.tenantId, userId, "disabled");
      await repositories.sessions.revokeAllForUser(actor.tenantId, userId);
      await repositories.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "user.deactivated",
        resourceType: "user",
        resourceId: userId,
        metadata: null,
        ipAddress: null,
      });
    });
  }

  /**
   * Substitui os papeis de um usuario. Requer permissao role:assign. Auditado.
   */
  async changeRole(
    actor: TenantContext,
    userId: UserId,
    role: Role,
    unitId: ClinicUnitId | null,
  ): Promise<void> {
    this.deps.authorization.ensure(actor, "role:assign", { tenantId: actor.tenantId });

    await this.deps.unitOfWork.run(async (repositories) => {
      const user = await repositories.users.findById(actor.tenantId, userId);
      if (!user) {
        throw new NotFoundError("Usuario nao encontrado.");
      }
      await repositories.roles.removeAll(actor.tenantId, userId);
      await repositories.roles.assign(actor.tenantId, userId, role, unitId);
      await repositories.sessions.revokeAllForUser(actor.tenantId, userId);
      await repositories.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "user.role_changed",
        resourceType: "user",
        resourceId: userId,
        metadata: { role, unitId },
        ipAddress: null,
      });
    });
  }
}
