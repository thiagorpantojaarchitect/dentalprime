/**
 * Autorizacao RBAC do ai-front-desk. Recepcao (front-desk) e gestao operam a
 * recepcao por IA. A fonte conceitual de papeis e `@dentalprime/core`.
 *
 * Ver `.kiro/specs/ai-front-desk/requirements.md`.
 */

import type { Role, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "./errors.js";

export type Action = "frontdesk:read" | "frontdesk:manage";

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: ["frontdesk:read", "frontdesk:manage"],
  manager: ["frontdesk:read", "frontdesk:manage"],
  "front-desk": ["frontdesk:read", "frontdesk:manage"],
  dentist: ["frontdesk:read"],
  specialist: ["frontdesk:read"],
  assistant: ["frontdesk:read"],
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
