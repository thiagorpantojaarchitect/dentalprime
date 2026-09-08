/**
 * Autorizacao RBAC do patient-record.
 *
 * Espelha o modelo do identity-access para as acoes deste dominio. Mantido local
 * porque cada servico e um limite de dominio independente; a fonte conceitual de
 * papeis e `@dentalprime/core`.
 *
 * Ver `.kiro/specs/patient-record/requirements.md`.
 */

import type { Role, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "./errors.js";

export type Action = "patient:read" | "patient:manage";

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: ["patient:read", "patient:manage"],
  manager: ["patient:read", "patient:manage"],
  dentist: ["patient:read", "patient:manage"],
  specialist: ["patient:read", "patient:manage"],
  assistant: ["patient:read"],
  "front-desk": ["patient:read", "patient:manage"],
  patient: [],
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
