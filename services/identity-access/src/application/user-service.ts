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

import { ConflictError, NotFoundError } from "../domain/errors.js";
import type { User } from "../domain/models.js";
import type {
  RoleRepository,
  SessionRepository,
  UserRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";
import { AuthorizationService } from "./authorization-service.js";
import type { PasswordHasher } from "./password.js";

export interface InviteUserInput {
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly unitId?: ClinicUnitId | null;
}

export interface UserServiceDeps {
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly passwords: PasswordHasher;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class UserService {
  constructor(private readonly deps: UserServiceDeps) {}

  /**
   * Convida um usuario: cria em estado pendente e atribui o papel inicial.
   * Requer permissao user:invite no tenant do ator.
   */
  async invite(actor: TenantContext, input: InviteUserInput): Promise<User> {
    this.deps.authorization.ensure(actor, "user:invite", { tenantId: actor.tenantId });

    const existing = await this.deps.users.findByEmail(actor.tenantId, input.email);
    if (existing) {
      throw new ConflictError("Ja existe um usuario com este email no tenant.");
    }

    const user = await this.deps.users.create({
      tenantId: actor.tenantId,
      email: input.email,
      displayName: input.displayName,
      passwordHash: null,
      status: "pending",
    });

    this.deps.authorization.ensure(actor, "role:assign", { tenantId: actor.tenantId });
    await this.deps.roles.assign(
      actor.tenantId,
      user.id,
      input.role,
      input.unitId ?? null,
    );

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "user.invited",
      resourceType: "user",
      resourceId: user.id,
      metadata: { role: input.role, unitId: input.unitId ?? null },
    });

    return user;
  }

  /**
   * Ativa um usuario pendente definindo sua senha. Fluxo normalmente disparado
   * pelo proprio convidado a partir de um token de convite (validado na API).
   */
  async activate(tenantId: TenantId, userId: UserId, password: string): Promise<void> {
    const user = await this.deps.users.findById(tenantId, userId);
    if (!user) {
      throw new NotFoundError("Usuario nao encontrado.");
    }
    if (user.status === "disabled") {
      throw new ConflictError("Usuario desativado nao pode ser ativado.");
    }

    const passwordHash = await this.deps.passwords.hash(password);
    await this.deps.users.setPasswordHash(tenantId, userId, passwordHash);
    await this.deps.users.setStatus(tenantId, userId, "active");

    await this.deps.audit.record({
      tenantId,
      actorUserId: userId,
      action: "user.activated",
      resourceType: "user",
      resourceId: userId,
    });
  }

  /**
   * Desativa um usuario: bloqueia acesso e encerra todas as sessoes ativas.
   * Requer permissao user:manage.
   */
  async deactivate(actor: TenantContext, userId: UserId): Promise<void> {
    this.deps.authorization.ensure(actor, "user:manage", { tenantId: actor.tenantId });

    const user = await this.deps.users.findById(actor.tenantId, userId);
    if (!user) {
      throw new NotFoundError("Usuario nao encontrado.");
    }

    await this.deps.users.setStatus(actor.tenantId, userId, "disabled");
    await this.deps.sessions.revokeAllForUser(actor.tenantId, userId);

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "user.deactivated",
      resourceType: "user",
      resourceId: userId,
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

    const user = await this.deps.users.findById(actor.tenantId, userId);
    if (!user) {
      throw new NotFoundError("Usuario nao encontrado.");
    }

    await this.deps.roles.removeAll(actor.tenantId, userId);
    await this.deps.roles.assign(actor.tenantId, userId, role, unitId);

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "user.role_changed",
      resourceType: "user",
      resourceId: userId,
      metadata: { role, unitId },
    });
  }
}
