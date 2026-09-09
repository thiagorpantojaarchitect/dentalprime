/**
 * Pagina de agenda: cria um agendamento. Consome smart-scheduling. O backend
 * verifica conflito de horario e isolamento por tenant.
 */

import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client.js";
import { useServices } from "../api/use-services.js";

export function SchedulePage(): JSX.Element {
  const { scheduling } = useServices();

  const [patientId, setPatientId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setSubmitting(true);
    try {
      const appointment = await scheduling.book({
        patientId,
        providerId,
        unitId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      setStatus(appointment.status);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SCHEDULE_CONFLICT") {
        setError("Conflito de horário: já existe um agendamento nesse período.");
      } else if (err instanceof ApiError && err.code === "VALIDATION") {
        setError("Dados inválidos. Verifique os horários.");
      } else {
        setError("Não foi possível agendar.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h2>Agenda</h2>
      <form
        className="card"
        onSubmit={(e) => void onSubmit(e)}
        aria-label="Novo agendamento"
      >
        <h3>Novo agendamento</h3>
        <div className="field">
          <label htmlFor="patientId">Paciente (id)</label>
          <input
            id="patientId"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="providerId">Profissional (id)</label>
          <input
            id="providerId"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="unitId">Unidade (id)</label>
          <input
            id="unitId"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="startsAt">Início</label>
          <input
            id="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="endsAt">Fim</label>
          <input
            id="endsAt"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Agendando..." : "Agendar"}
        </button>
      </form>

      {status && (
        <div className="card" style={{ marginTop: 24 }} aria-label="Agendamento criado">
          <h3>Agendamento criado</h3>
          <p>Status: {status}</p>
        </div>
      )}
    </section>
  );
}
