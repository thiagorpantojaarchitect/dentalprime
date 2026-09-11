/**
 * Modulos de API por dominio, construidos sobre o ApiClient. Cada dominio tem
 * sua base URL (servico) e expoe operacoes tipadas usadas pelas telas.
 *
 * Convencoes de backend refletidas aqui:
 * - Rotas protegidas nao recebem tenantId no corpo (vem do token).
 * - Dinheiro de entrada e decimal-string ("120.00").
 * - Listagens respondem objetos-wrapper; desembrulhamos para arrays.
 */

import { ApiClient } from "./client.js";
import type {
  Anamnesis,
  AiChannel,
  ClinicalRecord,
  ConsentDecision,
  ConsentResult,
  ConvertedLead,
  CreatedAppointment,
  CreatedCampaign,
  CreatedClinicalRecord,
  CreatedConversation,
  CreatedHandoff,
  CreatedInteraction,
  CreatedInvoice,
  CreatedInvoiceItem,
  CreatedLead,
  CreatedPatient,
  CreatedPlanItem,
  CreatedProcedure,
  CreatedUser,
  CrmChannel,
  DecisionResult,
  Installment,
  MessageReply,
  OdontogramEntry,
  Patient,
  PatientUpdate,
  PaymentResult,
  PayoutResult,
  PlanItem,
  PlanRef,
  Procedure,
  ReconciliationResult,
  Role,
  SchedulingSuggestion,
  StatusResult,
  TokenPair,
  TreatmentPlan,
  TriageResult,
} from "./types.js";

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

/** API de gestao de usuarios e papeis (identity-access). */
export class UserApi {
  constructor(private readonly client: ApiClient) {}

  async invite(input: {
    email: string;
    displayName: string;
    role: Role;
    unitId?: string | null;
  }): Promise<CreatedUser> {
    return this.client.request<CreatedUser>("/users/invite", {
      method: "POST",
      body: input,
    });
  }

  async deactivate(userId: string): Promise<void> {
    await this.client.request<void>(`/users/${userId}/deactivate`, { method: "POST" });
  }

  async changeRole(userId: string, role: Role, unitId: string | null): Promise<void> {
    await this.client.request<void>(`/users/${userId}/role`, {
      method: "POST",
      body: { role, unitId },
    });
  }
}

/** API de pacientes e prontuario (patient-record). */
export class PatientApi {
  constructor(private readonly client: ApiClient) {}

  async register(input: {
    fullName: string;
    cpf: string;
    birthDate?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: Record<string, unknown> | null;
  }): Promise<CreatedPatient> {
    return this.client.request<CreatedPatient>("/patients", {
      method: "POST",
      body: input,
    });
  }

  async getById(patientId: string): Promise<Patient> {
    return this.client.request<Patient>(`/patients/${patientId}`);
  }

  async update(patientId: string, changes: PatientUpdate): Promise<Patient> {
    return this.client.request<Patient>(`/patients/${patientId}`, {
      method: "PATCH",
      body: changes,
    });
  }

  // --- Consentimento ---
  async grantConsent(
    patientId: string,
    purpose: string,
    termVersion: string,
  ): Promise<ConsentResult> {
    return this.client.request<ConsentResult>(`/patients/${patientId}/consents/grant`, {
      method: "POST",
      body: { purpose, termVersion },
    });
  }

  async revokeConsent(
    patientId: string,
    purpose: string,
    termVersion: string,
  ): Promise<ConsentResult> {
    return this.client.request<ConsentResult>(`/patients/${patientId}/consents/revoke`, {
      method: "POST",
      body: { purpose, termVersion },
    });
  }

  // --- Prontuario clinico (versionado, append-only) ---
  async addClinicalRecord(
    patientId: string,
    entryType: string,
    content: string,
  ): Promise<CreatedClinicalRecord> {
    return this.client.request<CreatedClinicalRecord>(
      `/patients/${patientId}/clinical-records`,
      { method: "POST", body: { entryType, content } },
    );
  }

  async correctClinicalRecord(
    recordKey: string,
    content: string,
  ): Promise<CreatedClinicalRecord> {
    return this.client.request<CreatedClinicalRecord>(
      `/clinical-records/${recordKey}/correction`,
      { method: "POST", body: { content } },
    );
  }

  async listClinicalRecords(patientId: string): Promise<readonly ClinicalRecord[]> {
    const res = await this.client.request<{ records: ClinicalRecord[] }>(
      `/patients/${patientId}/clinical-records`,
    );
    return res.records;
  }

  async clinicalRecordHistory(recordKey: string): Promise<readonly ClinicalRecord[]> {
    const res = await this.client.request<{ versions: ClinicalRecord[] }>(
      `/clinical-records/${recordKey}/history`,
    );
    return res.versions;
  }

  // --- Anamnese ---
  async saveAnamnesis(
    patientId: string,
    answers: Record<string, unknown>,
  ): Promise<{ version: number }> {
    return this.client.request<{ version: number }>(`/patients/${patientId}/anamnesis`, {
      method: "PUT",
      body: { answers },
    });
  }

  async getAnamnesis(patientId: string): Promise<Anamnesis | null> {
    const res = await this.client.request<{ anamnesis: Anamnesis | null }>(
      `/patients/${patientId}/anamnesis`,
    );
    return res.anamnesis;
  }

  // --- Odontograma ---
  async addOdontogramEntry(
    patientId: string,
    input: {
      toothNumber: number;
      surface?: string | null;
      condition: string;
      critical?: boolean;
    },
  ): Promise<{ id: string }> {
    return this.client.request<{ id: string }>(`/patients/${patientId}/odontogram`, {
      method: "POST",
      body: input,
    });
  }

  async listOdontogram(patientId: string): Promise<readonly OdontogramEntry[]> {
    const res = await this.client.request<{ entries: OdontogramEntry[] }>(
      `/patients/${patientId}/odontogram`,
    );
    return res.entries;
  }

  // --- Direitos do titular (LGPD) ---
  async exportData(patientId: string): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>(`/patients/${patientId}/export`);
  }

  async requestErasure(patientId: string): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>(
      `/patients/${patientId}/erasure`,
      { method: "POST" },
    );
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
    allowOverbooking?: boolean;
  }): Promise<CreatedAppointment> {
    return this.client.request<CreatedAppointment>("/appointments", {
      method: "POST",
      body: input,
    });
  }

  async setStatus(
    appointmentId: string,
    status: "confirmed" | "attended" | "no_show" | "cancelled",
  ): Promise<StatusResult> {
    return this.client.request<StatusResult>(`/appointments/${appointmentId}/status`, {
      method: "POST",
      body: { status },
    });
  }
}

/** API de planos de tratamento (treatment-plan). */
export class TreatmentApi {
  constructor(private readonly client: ApiClient) {}

  async createProcedure(input: {
    name: string;
    description?: string | null;
    baseCost: string;
    licensedCode?: string | null;
  }): Promise<CreatedProcedure> {
    return this.client.request<CreatedProcedure>("/procedures", {
      method: "POST",
      body: input,
    });
  }

  async listProcedures(): Promise<readonly Procedure[]> {
    const res = await this.client.request<{ procedures: Procedure[] }>("/procedures");
    return res.procedures;
  }

  async createPlan(patientId: string, title: string): Promise<PlanRef> {
    return this.client.request<PlanRef>("/plans", {
      method: "POST",
      body: { patientId, title },
    });
  }

  async getPlan(planKey: string): Promise<TreatmentPlan> {
    return this.client.request<TreatmentPlan>(`/plans/${planKey}`);
  }

  async setPlanStatus(
    planKey: string,
    status: "draft" | "active" | "completed" | "cancelled",
  ): Promise<{ planKey: string; status: string }> {
    return this.client.request<{ planKey: string; status: string }>(
      `/plans/${planKey}/status`,
      { method: "POST", body: { status } },
    );
  }

  async addItem(
    planKey: string,
    input: {
      procedureId: string;
      phase?: number;
      orderInPhase?: number;
      dependsOnItemId?: string | null;
      estimatedCost?: string | null;
    },
  ): Promise<CreatedPlanItem> {
    return this.client.request<CreatedPlanItem>(`/plans/${planKey}/items`, {
      method: "POST",
      body: input,
    });
  }

  async listItems(planKey: string): Promise<readonly PlanItem[]> {
    const res = await this.client.request<{ items: PlanItem[] }>(
      `/plans/${planKey}/items`,
    );
    return res.items;
  }

  async decidePlan(
    planKey: string,
    decision: "accepted" | "declined" | "deferred",
    note?: string | null,
  ): Promise<DecisionResult> {
    return this.client.request<DecisionResult>(`/plans/${planKey}/decision`, {
      method: "POST",
      body: { decision, note: note ?? null },
    });
  }

  async setItemStatus(
    itemId: string,
    status: "accepted" | "in_progress" | "completed" | "cancelled",
  ): Promise<StatusResult> {
    return this.client.request<StatusResult>(`/items/${itemId}/status`, {
      method: "POST",
      body: { status },
    });
  }
}

/** API financeira (finance). Valores de entrada em decimal-string. */
export class FinanceApi {
  constructor(private readonly client: ApiClient) {}

  async createInvoice(input: {
    patientId: string;
    unitId: string;
    currency?: string;
  }): Promise<CreatedInvoice> {
    return this.client.request<CreatedInvoice>("/invoices", {
      method: "POST",
      body: input,
    });
  }

  async addItem(
    invoiceId: string,
    input: { description: string; quantity?: number; unitPrice: string },
  ): Promise<CreatedInvoiceItem> {
    return this.client.request<CreatedInvoiceItem>(`/invoices/${invoiceId}/items`, {
      method: "POST",
      body: input,
    });
  }

  async pay(
    invoiceId: string,
    input: {
      amount: string;
      method: "cash" | "card" | "pix" | "boleto" | "transfer";
      externalRef?: string | null;
    },
  ): Promise<PaymentResult> {
    return this.client.request<PaymentResult>(`/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: input,
    });
  }

  async createPaymentPlan(
    invoiceId: string,
    installmentCount: number,
    firstDueDate: string,
  ): Promise<readonly Installment[]> {
    const res = await this.client.request<{ installments: Installment[] }>(
      `/invoices/${invoiceId}/payment-plan`,
      { method: "POST", body: { installmentCount, firstDueDate } },
    );
    return res.installments;
  }

  async payInstallment(installmentId: string): Promise<void> {
    await this.client.request<void>(`/installments/${installmentId}/pay`, {
      method: "POST",
    });
  }

  async createPayout(input: {
    providerId: string;
    invoiceItemId: string;
    base: string;
    rateBasisPoints: number;
  }): Promise<PayoutResult> {
    return this.client.request<PayoutResult>("/payouts", {
      method: "POST",
      body: input,
    });
  }

  async reconcile(input: {
    reference: string;
    expected: string;
    received: string;
  }): Promise<ReconciliationResult> {
    return this.client.request<ReconciliationResult>("/reconciliations", {
      method: "POST",
      body: input,
    });
  }
}

/** API de CRM e crescimento (crm-growth). */
export class CrmApi {
  constructor(private readonly client: ApiClient) {}

  async createLead(input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    source?: string | null;
  }): Promise<CreatedLead> {
    return this.client.request<CreatedLead>("/leads", { method: "POST", body: input });
  }

  async setLeadStatus(
    leadId: string,
    status: "contacted" | "qualified" | "lost",
  ): Promise<StatusResult> {
    return this.client.request<StatusResult>(`/leads/${leadId}/status`, {
      method: "POST",
      body: { status },
    });
  }

  async convertLead(leadId: string, patientId: string): Promise<ConvertedLead> {
    return this.client.request<ConvertedLead>(`/leads/${leadId}/convert`, {
      method: "POST",
      body: { patientId },
    });
  }

  async addInteraction(input: {
    leadId?: string | null;
    patientId?: string | null;
    kind: string;
    channel: CrmChannel;
    note?: string | null;
  }): Promise<CreatedInteraction> {
    return this.client.request<CreatedInteraction>("/interactions", {
      method: "POST",
      body: input,
    });
  }

  async createCampaign(input: {
    name: string;
    purpose: string;
    channel: CrmChannel;
    startsAt?: string | null;
    endsAt?: string | null;
  }): Promise<CreatedCampaign> {
    return this.client.request<CreatedCampaign>("/campaigns", {
      method: "POST",
      body: input,
    });
  }

  async optIn(
    contactRef: string,
    purpose: string,
    channel: CrmChannel,
  ): Promise<ConsentDecision> {
    return this.client.request<ConsentDecision>("/consent/opt-in", {
      method: "POST",
      body: { contactRef, purpose, channel },
    });
  }

  async optOut(
    contactRef: string,
    purpose: string,
    channel: CrmChannel,
  ): Promise<ConsentDecision> {
    return this.client.request<ConsentDecision>("/consent/opt-out", {
      method: "POST",
      body: { contactRef, purpose, channel },
    });
  }
}

/** API de recepcao por IA (ai-front-desk). Assistiva, com revisao humana. */
export class AiFrontDeskApi {
  constructor(private readonly client: ApiClient) {}

  async startConversation(
    channel: AiChannel,
    contactRef?: string | null,
  ): Promise<CreatedConversation> {
    return this.client.request<CreatedConversation>("/conversations", {
      method: "POST",
      body: { channel, contactRef: contactRef ?? null },
    });
  }

  async sendMessage(conversationId: string, content: string): Promise<MessageReply> {
    return this.client.request<MessageReply>(
      `/conversations/${conversationId}/messages`,
      { method: "POST", body: { content } },
    );
  }

  async triage(text: string): Promise<TriageResult> {
    return this.client.request<TriageResult>("/triage", {
      method: "POST",
      body: { text },
    });
  }

  async handoff(conversationId: string, reason: string): Promise<CreatedHandoff> {
    return this.client.request<CreatedHandoff>(
      `/conversations/${conversationId}/handoff`,
      { method: "POST", body: { reason } },
    );
  }

  async suggestScheduling(
    conversationId: string,
    suggestedSlots: readonly string[],
  ): Promise<SchedulingSuggestion> {
    return this.client.request<SchedulingSuggestion>(
      `/conversations/${conversationId}/scheduling-suggestions`,
      { method: "POST", body: { suggestedSlots } },
    );
  }

  async reviewAction(actionId: string, decision: "approved" | "rejected"): Promise<void> {
    await this.client.request<void>(`/ai-actions/${actionId}/review`, {
      method: "POST",
      body: { decision },
    });
  }
}
