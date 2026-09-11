/**
 * Tipos dos contratos de API consumidos pelo frontend. Espelham as respostas
 * dos servicos de backend. tenantId vem do token nas rotas protegidas; o
 * frontend nunca o envia no corpo (excecao: rotas publicas de auth).
 *
 * Convencoes:
 * - Dinheiro de entrada e decimal-string ("120.00"); respostas do finance vem
 *   em centavos inteiros (campos *Cents).
 * - Datas sao ISO 8601. IDs sao UUID.
 * - Listagens retornam objetos-wrapper ({ records }, { items }, ...).
 */

// --- identity-access ---

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

export interface CreatedUser {
  readonly id: string;
  readonly status: string;
}

// --- patient-record ---

export interface CreatedPatient {
  readonly id: string;
}

export interface Patient {
  readonly id: string;
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate?: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address?: Record<string, unknown> | null;
  readonly active: boolean;
}

export interface PatientUpdate {
  readonly fullName?: string;
  readonly birthDate?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly address?: Record<string, unknown> | null;
  readonly active?: boolean;
}

export interface ConsentResult {
  readonly id: string;
  readonly status: string;
}

export interface ClinicalRecord {
  readonly recordKey: string;
  readonly version: number;
  readonly entryType?: string;
  readonly content?: string;
  readonly authorId?: string;
  readonly createdAt?: string;
}

export interface CreatedClinicalRecord {
  readonly recordKey: string;
  readonly version: number;
}

export interface Anamnesis {
  readonly version: number;
  readonly answers?: Record<string, unknown>;
}

export interface OdontogramEntry {
  readonly id: string;
  readonly toothNumber: number;
  readonly surface: string | null;
  readonly condition: string;
  readonly critical?: boolean;
  readonly createdAt?: string;
}

// --- smart-scheduling ---

export interface CreatedAppointment {
  readonly id: string;
  readonly status: string;
}

// --- treatment-plan ---

export interface CreatedProcedure {
  readonly id: string;
}

export interface Procedure {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly baseCost?: string;
  readonly licensedCode: string | null;
}

export interface PlanRef {
  readonly planKey: string;
  readonly version: number;
}

export interface TreatmentPlan {
  readonly planKey: string;
  readonly version: number;
  readonly patientId?: string;
  readonly title?: string;
  readonly status?: string;
}

export interface CreatedPlanItem {
  readonly id: string;
}

export interface PlanItem {
  readonly id: string;
  readonly procedureId: string;
  readonly phase?: number;
  readonly orderInPhase?: number;
  readonly status: string;
  readonly estimatedCost?: string | null;
}

export interface DecisionResult {
  readonly id: string;
  readonly decision: string;
}

export interface StatusResult {
  readonly id: string;
  readonly status: string;
}

// --- finance ---

export interface CreatedInvoice {
  readonly id: string;
  readonly status: string;
}

export interface CreatedInvoiceItem {
  readonly id: string;
  readonly totalCents: number;
}

export interface PaymentResult {
  readonly paymentId: string;
  readonly invoiceStatus: string;
  readonly balanceCents: number;
  readonly idempotentReplay: boolean;
}

export interface Installment {
  readonly id: string;
  readonly sequence?: number;
  readonly amountCents?: number;
  readonly dueDate?: string;
  readonly status?: string;
}

export interface PayoutResult {
  readonly id: string;
  readonly amountCents: number;
}

export interface ReconciliationResult {
  readonly id: string;
  readonly status: string;
  readonly differenceCents: number;
}

// --- crm-growth ---

export type CrmChannel = "phone" | "email" | "whatsapp" | "in_person";

export interface CreatedLead {
  readonly id: string;
  readonly status: string;
}

export interface ConvertedLead {
  readonly id: string;
  readonly status: string;
  readonly patientId: string;
}

export interface CreatedInteraction {
  readonly id: string;
}

export interface CreatedCampaign {
  readonly id: string;
}

export interface ConsentDecision {
  readonly id: string;
  readonly decision: string;
}

// --- ai-front-desk ---

export type AiChannel = "chat" | "whatsapp" | "voice" | "web";

export interface CreatedConversation {
  readonly id: string;
  readonly status: string;
}

export interface MessageReply {
  readonly reply: { readonly content: string; readonly isAI: boolean };
  readonly handedOff: boolean;
}

export interface TriageResult {
  readonly reason: string;
  readonly perceivedUrgency: "low" | "medium" | "high";
  readonly recommendHandoff: boolean;
}

export interface CreatedHandoff {
  readonly id: string;
}

export interface SchedulingSuggestion {
  readonly id: string;
  readonly reviewStatus: string;
}
