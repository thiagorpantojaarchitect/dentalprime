/**
 * Servicos de API por dominio para os apps mobile, sobre o ApiClient.
 *
 * - AuthApi: autenticacao (identity-access).
 * - PatientSelfApi: operacoes do proprio paciente (patient-record). Hoje o
 *   backend expoe a leitura do prontuario por id; endpoints "meus" dedicados
 *   (ex.: minhas consultas) serao adicionados quando o produto do paciente
 *   evoluir. Mantemos o contrato honesto com o que existe.
 * - ClinicalApi: operacoes do profissional em consulta (patient-record +
 *   smart-scheduling): registrar evolucao (append-only), listar prontuario,
 *   agendar e mudar status de agendamento.
 */

import { ApiClient } from "./api-client.js";
import type {
  ClinicalRecord,
  CreatedAppointment,
  CreatedClinicalRecord,
  Patient,
  StatusResult,
  TokenPair,
} from "./types.js";

/** Autenticacao (identity-access). */
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

/** Operacoes do proprio paciente (patient-record). */
export class PatientSelfApi {
  constructor(private readonly client: ApiClient) {}

  /** Le o proprio prontuario/cadastro por id (o backend isola por tenant). */
  async getMyRecord(patientId: string): Promise<Patient> {
    return this.client.request<Patient>(`/patients/${patientId}`);
  }

  /** Lista as evolucoes do proprio prontuario. */
  async listMyClinicalRecords(patientId: string): Promise<readonly ClinicalRecord[]> {
    const res = await this.client.request<{ records: ClinicalRecord[] }>(
      `/patients/${patientId}/clinical-records`,
    );
    return res.records;
  }
}

/** Operacoes clinicas do profissional (patient-record + smart-scheduling). */
export class ClinicalApi {
  constructor(
    private readonly patientClient: ApiClient,
    private readonly schedulingClient: ApiClient,
  ) {}

  async getPatient(patientId: string): Promise<Patient> {
    return this.patientClient.request<Patient>(`/patients/${patientId}`);
  }

  async listClinicalRecords(patientId: string): Promise<readonly ClinicalRecord[]> {
    const res = await this.patientClient.request<{ records: ClinicalRecord[] }>(
      `/patients/${patientId}/clinical-records`,
    );
    return res.records;
  }

  /**
   * Registra uma evolucao clinica. Append-only: o backend versiona e nao
   * sobrescreve (seguranca clinica). Correcoes criam nova versao.
   */
  async addClinicalRecord(
    patientId: string,
    entryType: string,
    content: string,
  ): Promise<CreatedClinicalRecord> {
    return this.patientClient.request<CreatedClinicalRecord>(
      `/patients/${patientId}/clinical-records`,
      { method: "POST", body: { entryType, content } },
    );
  }

  async book(input: {
    patientId: string;
    providerId: string;
    unitId: string;
    startsAt: string;
    endsAt: string;
  }): Promise<CreatedAppointment> {
    return this.schedulingClient.request<CreatedAppointment>("/appointments", {
      method: "POST",
      body: input,
    });
  }

  async setAppointmentStatus(
    appointmentId: string,
    status: "confirmed" | "attended" | "no_show" | "cancelled",
  ): Promise<StatusResult> {
    return this.schedulingClient.request<StatusResult>(
      `/appointments/${appointmentId}/status`,
      { method: "POST", body: { status } },
    );
  }
}
