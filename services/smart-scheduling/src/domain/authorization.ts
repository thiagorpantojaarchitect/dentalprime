/**
 * Autorizacao RBAC do smart-scheduling para as acoes de agenda.
 * Espelha o modelo do identity-access; a fonte de papeis e `@dentalprime/core`.
 */

import type { Role, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "./errors.js";

export type Action = "appointment:read" | "appointment:manage";

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: ["appointment:read", "appointment:manage"],
  manager: ["appointment:read", "appointment:manage"],
  dentist: ["appointment:read", "appointment:manage"],
  specialist: ["appointment:read", "appointment:manage"],
  assistant: ["appointment:read", "appointment:manage"],
  "front-desk": ["appointment:read", "appointment:manage"],
  // Paciente pode ver seus proprios agendamentos (leitura), nao gerenciar agenda.
  patient: ["appointment:read"],
};

function roleGrants(roles: readonly Role[], action: Action): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(action));
}

export class AuthorizationService {
  can(context: TenantContext, action: Action, resourceTenantId: string): boolean {
    if (context.tenantId !== resourceTenantId) return false;
    return roleGrants(context.roles, action);
  }

  ensure(context: TenantContext, action: Action, resourceTenantId: string): void {
    if (!this.can(context, action, resourceTenantId)) {
      throw new ForbiddenError();
    }
  }
}
