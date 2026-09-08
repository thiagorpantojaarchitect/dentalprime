/**
 * Autorizacao RBAC do treatment-plan.
 *
 * Papeis clinicos (dentist/specialist) e gestao (owner/manager) gerenciam
 * planos. Recepcao pode ler e registrar decisao de aceitacao do paciente. A
 * fonte conceitual de papeis e `@dentalprime/core`.
 *
 * Ver `.kiro/specs/treatment-plan/requirements.md`.
 */

import type { Role, TenantContext } from "@dentalprime/core";

import { ForbiddenError } from "./errors.js";

export type Action = "treatment:read" | "treatment:manage" | "treatment:accept";

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: ["treatment:read", "treatment:manage", "treatment:accept"],
  manager: ["treatment:read", "treatment:manage", "treatment:accept"],
  dentist: ["treatment:read", "treatment:manage", "treatment:accept"],
  specialist: ["treatment:read", "treatment:manage", "treatment:accept"],
  assistant: ["treatment:read"],
  // Recepcao registra a decisao do paciente sobre o plano.
  "front-desk": ["treatment:read", "treatment:accept"],
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
