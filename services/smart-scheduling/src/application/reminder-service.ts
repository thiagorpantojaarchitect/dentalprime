/**
 * ReminderService: agenda lembretes/confirmacoes e registra o resultado.
 *
 * O envio real (SMS, e-mail, WhatsApp, push) e assincrono e feito por um
 * worker/consumidor fora deste servico. Aqui registramos o lembrete como
 * pendente e, quando o envio e processado, marcamos o resultado. Falhas podem
 * ser reprocessadas (o registro permanece consultavel).
 *
 * O envio deve respeitar o consentimento de contato do paciente; essa checagem
 * e responsabilidade do fluxo que dispara o lembrete (integra com patient-record).
 *
 * Ver `.kiro/specs/smart-scheduling/requirements.md` (Requisito 3).
 */

import type { TenantContext } from "@dentalprime/core";

import { AuthorizationService } from "../domain/authorization.js";
import { NotFoundError } from "../domain/errors.js";
import type { AppointmentId, Reminder, ReminderChannel } from "../domain/models.js";
import type {
  AppointmentRepository,
  ReminderRepository,
} from "../domain/repositories.js";
import type { AuditService } from "./audit-service.js";

export interface ScheduleReminderInput {
  readonly appointmentId: AppointmentId;
  readonly channel: ReminderChannel;
  readonly scheduledFor: Date;
}

export interface ReminderServiceDeps {
  readonly reminders: ReminderRepository;
  readonly appointments: AppointmentRepository;
  readonly audit: AuditService;
  readonly authorization: AuthorizationService;
}

export class ReminderService {
  constructor(private readonly deps: ReminderServiceDeps) {}

  /** Agenda um lembrete (estado pendente). Requer appointment:manage. */
  async schedule(actor: TenantContext, input: ScheduleReminderInput): Promise<Reminder> {
    this.deps.authorization.ensure(actor, "appointment:manage", actor.tenantId);

    const appointment = await this.deps.appointments.findById(
      actor.tenantId,
      input.appointmentId,
    );
    if (!appointment) {
      throw new NotFoundError("Agendamento nao encontrado.");
    }

    const reminder = await this.deps.reminders.create({
      tenantId: actor.tenantId,
      appointmentId: input.appointmentId,
      channel: input.channel,
      scheduledFor: input.scheduledFor,
    });

    await this.deps.audit.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "reminder.scheduled",
      resourceType: "reminder",
      resourceId: reminder.id,
    });

    return reminder;
  }

  /**
   * Registra o resultado do envio (chamado pelo worker de envio). Falha nao
   * derruba o fluxo; o registro permite reprocessamento.
   */
  async recordResult(
    tenantId: string,
    reminderId: string,
    status: "sent" | "failed",
    result: string | null,
  ): Promise<void> {
    await this.deps.reminders.markResult(tenantId, reminderId, status, result);
  }
}
