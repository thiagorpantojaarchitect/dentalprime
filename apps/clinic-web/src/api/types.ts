/**
 * Tipos dos contratos de API consumidos pelo frontend. Espelham as respostas
 * dos servicos de backend (identity-access, patient-record, smart-scheduling).
 */

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface CreatedPatient {
  readonly id: string;
}

export interface Patient {
  readonly id: string;
  readonly fullName: string;
  readonly cpf: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly active: boolean;
}

export interface CreatedAppointment {
  readonly id: string;
  readonly status: string;
}
