/**
 * Autorizacao RBAC do crm-growth. Gestao (owner/manager) e recepcao (front-desk)
 * operam CRM. A fonte conceitual de papeis e `@dentalprime/core`.
 *
 * Ver `.kiro/specs/crm-growth/requirements.md`.
 */

import type { Role, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "./errors.js";

export type Action = "crm:read" | "crm:manage";

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: ["crm:read", "crm:manage"],
  manager: ["crm:read", "crm:manage"],
  "front-desk": ["crm:read", "crm:manage"],
  dentist: ["crm:read"],
  specialist: ["crm:read"],
  assistant: ["crm:read"],
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
