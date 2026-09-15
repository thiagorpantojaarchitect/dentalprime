/**
 * Modulos de API do admin-portal sobre o ApiClient. O portal consome apenas o
 * identity-access: autenticacao e gestao de rede (tenants, unidades, usuarios).
 */

import { ApiClient } from "./client.js";
import type {
  ClinicUnit,
  NetworkUser,
  ProvisionedTenant,
  Tenant,
  TokenPair,
} from "./types.js";

export interface PageResult<T> {
  readonly items: readonly T[];
  /** Numero da pagina no contrato HTTP (base 1). */
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

/** API de autenticacao (identity-access). */
export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  async login(tenantId: string, email: string, password: string): Promise<TokenPair> {
    return this.client.request<TokenPair>("/auth/login", {
      method: "POST",
      body: { tenantId, email, password },
      public: true,
    });
  }

  async refresh(tenantId: string, refreshToken: string): Promise<TokenPair> {
    return this.client.request<TokenPair>("/auth/refresh", {
      method: "POST",
      body: { tenantId, refreshToken },
      public: true,
    });
  }

  async logout(tenantId: string, refreshToken: string): Promise<void> {
    await this.client.request<void>("/auth/logout", {
      method: "POST",
      body: { tenantId, refreshToken },
      public: true,
    });
  }

  async activate(
    tenantId: string,
    activationToken: string,
    password: string,
  ): Promise<void> {
    await this.client.request<void>("/users/activate", {
      method: "POST",
      body: { tenantId, activationToken, password },
      public: true,
    });
  }
}

/** API de gestao de rede (identity-access): tenants, unidades e usuarios. */
export class NetworkApi {
  constructor(private readonly client: ApiClient) {}

  async currentTenant(): Promise<Tenant> {
    return this.client.request<Tenant>("/tenants/current");
  }

  async listTenants(page = 1, pageSize = 10): Promise<PageResult<Tenant>> {
    const res = await this.client.request<{
      tenants: Tenant[];
      page: number;
      pageSize: number;
      hasMore: boolean;
    }>(`/tenants?page=${page}&pageSize=${pageSize}`);
    return {
      items: res.tenants,
      page: res.page ?? page,
      pageSize: res.pageSize ?? pageSize,
      hasMore: res.hasMore ?? false,
    };
  }

  async provisionTenant(input: {
    name: string;
    ownerEmail: string;
    ownerName: string;
  }): Promise<ProvisionedTenant> {
    return this.client.request<ProvisionedTenant>("/tenants", {
      method: "POST",
      body: input,
    });
  }

  async listUnits(page = 1, pageSize = 10): Promise<PageResult<ClinicUnit>> {
    const res = await this.client.request<{
      units: ClinicUnit[];
      page: number;
      pageSize: number;
      hasMore: boolean;
    }>(`/units?page=${page}&pageSize=${pageSize}`);
    return {
      items: res.units,
      page: res.page ?? page,
      pageSize: res.pageSize ?? pageSize,
      hasMore: res.hasMore ?? false,
    };
  }

  async createUnit(name: string): Promise<ClinicUnit> {
    return this.client.request<ClinicUnit>("/units", {
      method: "POST",
      body: { name },
    });
  }

  async deactivateUnit(unitId: string): Promise<void> {
    await this.client.request<void>(`/units/${unitId}/deactivate`, { method: "POST" });
  }

  async listUsers(page = 1, pageSize = 10): Promise<PageResult<NetworkUser>> {
    const res = await this.client.request<{
      users: NetworkUser[];
      page: number;
      pageSize: number;
      hasMore: boolean;
    }>(`/users?page=${page}&pageSize=${pageSize}`);
    return {
      items: res.users,
      page: res.page ?? page,
      pageSize: res.pageSize ?? pageSize,
      hasMore: res.hasMore ?? false,
    };
  }

  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.client.request<void>("/users/me/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  }
}
