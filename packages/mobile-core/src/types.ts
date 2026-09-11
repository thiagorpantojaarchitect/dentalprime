/**
 * Tipos de contrato consumidos pelos apps mobile. Espelham as respostas dos
 * servicos de backend (identity-access, patient-record, smart-scheduling).
 *
 * tenantId vem do token nas rotas protegidas; nunca e enviado no corpo (excecao:
 * rotas publicas de auth).
 */

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface Patient {
  readonly id: string;
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate?: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly active: boolean;
}

export interface ClinicalRecord {
  readonly recordKey: string;
  readonly version: number;
  readonly entryType?: string;
  readonly content?: string;
  readonly createdAt?: string;
}

export interface CreatedClinicalRecord {
  readonly recordKey: string;
  readonly version: number;
}

export interface CreatedAppointment {
  readonly id: string;
  readonly status: string;
}

export interface StatusResult {
  readonly id: string;
  readonly status: string;
}
