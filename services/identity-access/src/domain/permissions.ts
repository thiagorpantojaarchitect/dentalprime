/**
 * Definicao de permissoes e mapa de papeis (RBAC) do DentalPrime.
 *
 * Este e o ponto unico que descreve o que cada papel pode fazer. O
 * AuthorizationService consulta este mapa para decidir allow/deny.
 *
 * Ver `.kiro/specs/identity-access/requirements.md` (Requisito 3).
 */

import type { Role } from "@dentalprime/core";

/**
 * Acoes protegidas do dominio, no formato "recurso:acao".
 * Novos modulos adicionam suas acoes aqui conforme evoluem.
 */
export type Action =
  | "tenant:read"
  | "tenant:manage"
  | "unit:read"
  | "unit:manage"
  | "user:read"
  | "user:invite"
  | "user:manage"
  | "role:assign"
  | "audit:read"
  | "patient:read"
  | "patient:manage"
  | "appointment:read"
  | "appointment:manage";

/**
 * Permissoes por papel. Um papel possui exatamente as acoes listadas.
 * "owner" e "manager" administram; papeis clinicos focam em pacientes/agenda;
 * "patient" tem acesso minimo aos proprios dados (refinado por escopo).
 */
const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: [
    "tenant:read",
    "tenant:manage",
    "unit:read",
    "unit:manage",
    "user:read",
    "user:invite",
    "user:manage",
    "role:assign",
    "audit:read",
    "patient:read",
    "patient:manage",
    "appointment:read",
    "appointment:manage",
  ],
  manager: [
    "tenant:read",
    "unit:read",
    "unit:manage",
    "user:read",
    "user:invite",
    "user:manage",
    "role:assign",
    "audit:read",
    "patient:read",
    "patient:manage",
    "appointment:read",
    "appointment:manage",
  ],
  dentist: [
    "unit:read",
    "user:read",
    "patient:read",
    "patient:manage",
    "appointment:read",
    "appointment:manage",
  ],
  specialist: [
    "unit:read",
    "user:read",
    "patient:read",
    "patient:manage",
    "appointment:read",
    "appointment:manage",
  ],
  assistant: ["unit:read", "patient:read", "appointment:read", "appointment:manage"],
  "front-desk": ["unit:read", "patient:read", "appointment:read", "appointment:manage"],
  patient: ["appointment:read"],
};

/**
 * Retorna o conjunto de acoes permitidas para um conjunto de papeis.
 */
export function permissionsForRoles(roles: readonly Role[]): ReadonlySet<Action> {
  const actions = new Set<Action>();
  for (const role of roles) {
    for (const action of ROLE_PERMISSIONS[role]) {
      actions.add(action);
    }
  }
  return actions;
}

/**
 * Indica se algum dos papeis concede a acao informada.
 */
export function roleGrants(roles: readonly Role[], action: Action): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(action));
}
