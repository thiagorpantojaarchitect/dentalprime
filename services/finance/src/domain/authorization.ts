/**
 * Autorizacao RBAC do finance. Gestao (owner/manager) e recepcao (front-desk)
 * operam o financeiro; papeis clinicos e paciente nao. A fonte de papeis e
 * `@dentalprime/core`.
 *
 * Ver `.kiro/specs/finance/requirements.md`.
 */

import type { Role, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "./errors.js";

export type Action = "finance:read" | "finance:manage";

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: ["finance:read", "finance:manage"],
  manager: ["finance:read", "finance:manage"],
  "front-desk": ["finance:read", "finance:manage"],
  dentist: ["finance:read"],
  specialist: ["finance:read"],
  assistant: [],
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
