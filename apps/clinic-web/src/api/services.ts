/**
 * Modulos de API por dominio, construidos sobre o ApiClient. Cada dominio tem
 * sua base URL (servico) e expoe operacoes tipadas usadas pelas telas.
 */

import { ApiClient } from "./client.js";
import type { CreatedAppointment, CreatedPatient, Patient, TokenPair } from "./types.js";

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
}

/** API de pacientes (patient-record). */
export class PatientApi {
  constructor(private readonly client: ApiClient) {}

  async register(input: {
    fullName: string;
    cpf: string;
    email?: string | null;
    phone?: string | null;
  }): Promise<CreatedPatient> {
    return this.client.request<CreatedPatient>("/patients", {
      method: "POST",
      body: input,
    });
  }

  async getById(patientId: string): Promise<Patient> {
    return this.client.request<Patient>(`/patients/${patientId}`);
  }
}

/** API de agenda (smart-scheduling). */
export class SchedulingApi {
  constructor(private readonly client: ApiClient) {}

  async book(input: {
    patientId: string;
    providerId: string;
    unitId: string;
    startsAt: string;
    endsAt: string;
  }): Promise<CreatedAppointment> {
    return this.client.request<CreatedAppointment>("/appointments", {
      method: "POST",
      body: input,
    });
  }
}
