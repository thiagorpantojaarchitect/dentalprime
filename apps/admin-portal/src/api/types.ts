/**
 * Tipos dos contratos de API consumidos pelo admin-portal. Espelham as respostas
 * do identity-access (auth + gestao de rede). tenantId vem do token nas rotas
 * protegidas; nunca e enviado no corpo (excecao: rotas publicas de auth).
 */

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export type Role =
  | "owner"
  | "manager"
  | "dentist"
  | "specialist"
  | "assistant"
  | "front-desk"
  | "patient";

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface ProvisionedTenant {
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
}

export interface ClinicUnit {
  readonly id: string;
  readonly tenantId?: string;
  readonly name: string;
  readonly active: boolean;
}

export interface NetworkUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly roles: readonly Role[];
}
