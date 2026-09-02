/**
 * Tipos base de multi-tenant.
 *
 * Toda entidade de negocio do DentalPrime e isolada por `tenantId`. O contexto
 * autenticado carrega o tenant, as unidades acessiveis e os papeis do usuario.
 * A camada de repositorio DEVE aplicar o filtro por `tenantId` em toda consulta.
 *
 * Ver `.kiro/steering/architecture.md` e `.kiro/steering/security-lgpd.md`.
 */

/** Identificador de um tenant (clinica ou rede). */
export type TenantId = string;

/** Identificador de uma unidade fisica (clinic_unit) sob um tenant. */
export type ClinicUnitId = string;

/** Identificador de um usuario. */
export type UserId = string;

/** Papeis clinicos e administrativos (RBAC). Ver modulo identity-access. */
export type Role =
  | "owner"
  | "manager"
  | "dentist"
  | "specialist"
  | "assistant"
  | "front-desk"
  | "patient";

/**
 * Contexto autenticado propagado pelas requisicoes. Nao deve conter PII
 * sensivel; apenas o necessario para autorizacao e isolamento.
 */
export interface TenantContext {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly roles: readonly Role[];
  /** Unidades que o usuario pode acessar dentro do tenant. */
  readonly units: readonly ClinicUnitId[];
}

/**
 * Verifica se o contexto tem acesso a uma unidade especifica do tenant.
 */
export function hasUnitAccess(context: TenantContext, unitId: ClinicUnitId): boolean {
  return context.units.includes(unitId);
}

/**
 * Verifica se o contexto possui pelo menos um dos papeis informados.
 */
export function hasAnyRole(context: TenantContext, roles: readonly Role[]): boolean {
  return context.roles.some((role) => roles.includes(role));
}
