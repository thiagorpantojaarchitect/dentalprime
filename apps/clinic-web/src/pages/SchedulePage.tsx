/**
 * Operacao da agenda por unidade: mantem o catalogo de profissionais e
 * recursos, registra disponibilidade/bloqueios e cria agendamentos. O backend
 * continua responsavel por isolamento do tenant, autorizacao e conflitos.
 */

import { useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import type {
  AvailabilityKind,
  CreatedAppointment,
  SchedulingProvider,
  SchedulingResource,
} from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
} from "../ui/components.js";

const AVAILABILITY_KINDS: ReadonlyArray<{
  readonly value: AvailabilityKind;
  readonly label: string;
}> = [
  { value: "available", label: "Disponível" },
  { value: "block", label: "Bloqueio" },
];

function schedulingError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === "SCHEDULE_CONFLICT") {
      return "Conflito de horário: o profissional ou recurso já está ocupado.";
    }
    if (error.code === "VALIDATION") return "Dados inválidos. Revise os campos.";
    if (error.code === "NOT_FOUND") {
      return "Profissional ou recurso não encontrado nesta unidade.";
    }
    if (error.code === "FORBIDDEN") {
      return "Você não tem permissão para gerenciar a agenda desta unidade.";
    }
    if (error.code === "CONFLICT") return "Este cadastro já existe.";
  }
  return fallback;
}

function isoInterval(
  startsAt: string,
  endsAt: string,
): { readonly startsAt: string; readonly endsAt: string } | null {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return null;
  }
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function providerOptions(
  providers: readonly SchedulingProvider[],
): ReadonlyArray<{ readonly value: string; readonly label: string }> {
  return [
    { value: "", label: "Selecione um profissional" },
    ...providers.map((provider) => ({
      value: provider.id,
      label: provider.displayName,
    })),
  ];
}

function resourceOptions(
  resources: readonly SchedulingResource[],
): ReadonlyArray<{ readonly value: string; readonly label: string }> {
  return [
    { value: "", label: "Sem recurso" },
    ...resources.map((resource) => ({
      value: resource.id,
      label: `${resource.name} · ${resource.kind}`,
    })),
  ];
}

export function SchedulePage(): JSX.Element {
  const { scheduling } = useServices();
  const catalogRequestRef = useRef(0);
  const unitRevisionRef = useRef(0);

  const [unitId, setUnitId] = useState("");
  const [providers, setProviders] = useState<readonly SchedulingProvider[]>([]);
  const [resources, setResources] = useState<readonly SchedulingResource[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [providerUserId, setProviderUserId] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [creatingProvider, setCreatingProvider] = useState(false);

  const [resourceName, setResourceName] = useState("");
  const [resourceKind, setResourceKind] = useState("");
  const [resourceMessage, setResourceMessage] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [creatingResource, setCreatingResource] = useState(false);

  const [availabilityProviderId, setAvailabilityProviderId] = useState("");
  const [availabilityResourceId, setAvailabilityResourceId] = useState("");
  const [availabilityKind, setAvailabilityKind] = useState<AvailabilityKind>("available");
  const [availabilityStartsAt, setAvailabilityStartsAt] = useState("");
  const [availabilityEndsAt, setAvailabilityEndsAt] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [creatingAvailability, setCreatingAvailability] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [bookingProviderId, setBookingProviderId] = useState("");
  const [bookingResourceId, setBookingResourceId] = useState("");
  const [bookingStartsAt, setBookingStartsAt] = useState("");
  const [bookingEndsAt, setBookingEndsAt] = useState("");
  const [appointment, setAppointment] = useState<CreatedAppointment | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const changeUnit = (value: string): void => {
    catalogRequestRef.current += 1;
    unitRevisionRef.current += 1;
    setUnitId(value);
    setProviders([]);
    setResources([]);
    setCatalogLoaded(false);
    setCatalogLoading(false);
    setCatalogError(null);
    setProviderMessage(null);
    setProviderError(null);
    setResourceMessage(null);
    setResourceError(null);
    setAvailabilityMessage(null);
    setAvailabilityError(null);
    setAppointment(null);
    setBookingError(null);
    setCreatingProvider(false);
    setCreatingResource(false);
    setCreatingAvailability(false);
    setBooking(false);
    setAvailabilityProviderId("");
    setAvailabilityResourceId("");
    setBookingProviderId("");
    setBookingResourceId("");
  };

  const loadCatalog = async (): Promise<void> => {
    const selectedUnitId = unitId.trim();
    setCatalogError(null);
    if (!selectedUnitId) {
      setCatalogError("Informe a unidade antes de carregar o catálogo.");
      return;
    }

    const requestId = ++catalogRequestRef.current;
    setCatalogLoading(true);
    try {
      const [loadedProviders, loadedResources] = await Promise.all([
        scheduling.listProviders(selectedUnitId),
        scheduling.listResources(selectedUnitId),
      ]);
      if (requestId !== catalogRequestRef.current) return;

      setProviders(loadedProviders);
      setResources(loadedResources);
      setCatalogLoaded(true);
      setAvailabilityProviderId((current) =>
        loadedProviders.some((provider) => provider.id === current)
          ? current
          : (loadedProviders[0]?.id ?? ""),
      );
      setBookingProviderId((current) =>
        loadedProviders.some((provider) => provider.id === current)
          ? current
          : (loadedProviders[0]?.id ?? ""),
      );
      setAvailabilityResourceId((current) =>
        loadedResources.some((resource) => resource.id === current) ? current : "",
      );
      setBookingResourceId((current) =>
        loadedResources.some((resource) => resource.id === current) ? current : "",
      );
    } catch (error) {
      if (requestId !== catalogRequestRef.current) return;
      setCatalogError(
        schedulingError(error, "Não foi possível carregar o catálogo da unidade."),
      );
    } finally {
      if (requestId === catalogRequestRef.current) setCatalogLoading(false);
    }
  };

  const createProvider = async (): Promise<void> => {
    setProviderError(null);
    setProviderMessage(null);
    if (!unitId.trim()) {
      setProviderError("Informe a unidade antes de cadastrar o profissional.");
      return;
    }

    const requestId = unitRevisionRef.current;
    setCreatingProvider(true);
    try {
      const provider = await scheduling.createProvider({
        unitId: unitId.trim(),
        userId: providerUserId.trim(),
        displayName: providerName.trim(),
      });
      if (requestId !== unitRevisionRef.current) return;
      setProviders((current) => [...current, provider]);
      setCatalogLoaded(true);
      setAvailabilityProviderId((current) => current || provider.id);
      setBookingProviderId((current) => current || provider.id);
      setProviderUserId("");
      setProviderName("");
      setProviderMessage("Profissional adicionado ao catálogo da unidade.");
    } catch (error) {
      if (requestId !== unitRevisionRef.current) return;
      setProviderError(
        schedulingError(error, "Não foi possível cadastrar o profissional."),
      );
    } finally {
      if (requestId === unitRevisionRef.current) setCreatingProvider(false);
    }
  };

  const createResource = async (): Promise<void> => {
    setResourceError(null);
    setResourceMessage(null);
    if (!unitId.trim()) {
      setResourceError("Informe a unidade antes de cadastrar o recurso.");
      return;
    }

    const requestId = unitRevisionRef.current;
    setCreatingResource(true);
    try {
      const resource = await scheduling.createResource({
        unitId: unitId.trim(),
        name: resourceName.trim(),
        kind: resourceKind.trim(),
      });
      if (requestId !== unitRevisionRef.current) return;
      setResources((current) => [...current, resource]);
      setCatalogLoaded(true);
      setResourceName("");
      setResourceKind("");
      setResourceMessage("Recurso adicionado ao catálogo da unidade.");
    } catch (error) {
      if (requestId !== unitRevisionRef.current) return;
      setResourceError(schedulingError(error, "Não foi possível cadastrar o recurso."));
    } finally {
      if (requestId === unitRevisionRef.current) setCreatingResource(false);
    }
  };

  const addAvailability = async (): Promise<void> => {
    setAvailabilityError(null);
    setAvailabilityMessage(null);
    const interval = isoInterval(availabilityStartsAt, availabilityEndsAt);
    if (!unitId.trim() || !availabilityProviderId || !interval) {
      setAvailabilityError(
        "Informe unidade, profissional e um intervalo com fim posterior ao início.",
      );
      return;
    }

    const requestId = unitRevisionRef.current;
    setCreatingAvailability(true);
    try {
      await scheduling.addAvailability({
        unitId: unitId.trim(),
        providerId: availabilityProviderId,
        kind: availabilityKind,
        ...interval,
        ...(availabilityResourceId ? { resourceId: availabilityResourceId } : {}),
      });
      if (requestId !== unitRevisionRef.current) return;
      setAvailabilityMessage(
        availabilityKind === "available"
          ? "Janela de atendimento registrada."
          : "Bloqueio de agenda registrado.",
      );
      setAvailabilityStartsAt("");
      setAvailabilityEndsAt("");
    } catch (error) {
      if (requestId !== unitRevisionRef.current) return;
      setAvailabilityError(
        schedulingError(error, "Não foi possível registrar a janela de agenda."),
      );
    } finally {
      if (requestId === unitRevisionRef.current) setCreatingAvailability(false);
    }
  };

  const bookAppointment = async (): Promise<void> => {
    setBookingError(null);
    setAppointment(null);
    const interval = isoInterval(bookingStartsAt, bookingEndsAt);
    if (!unitId.trim() || !patientId.trim() || !bookingProviderId || !interval) {
      setBookingError("Informe unidade, paciente, profissional e um intervalo válido.");
      return;
    }

    const requestId = unitRevisionRef.current;
    setBooking(true);
    try {
      const created = await scheduling.book({
        patientId: patientId.trim(),
        providerId: bookingProviderId,
        unitId: unitId.trim(),
        ...interval,
        ...(bookingResourceId ? { resourceId: bookingResourceId } : {}),
      });
      if (requestId !== unitRevisionRef.current) return;
      setAppointment(created);
    } catch (error) {
      if (requestId !== unitRevisionRef.current) return;
      setBookingError(schedulingError(error, "Não foi possível criar o agendamento."));
    } finally {
      if (requestId === unitRevisionRef.current) setBooking(false);
    }
  };

  const currentProviderOptions = providerOptions(providers);
  const currentResourceOptions = resourceOptions(resources);

  return (
    <section>
      <PageHeader
        title="Agenda"
        subtitle="Configure o catálogo e a disponibilidade da unidade antes de agendar."
      />

      <CardForm
        title="Unidade de atendimento"
        label="Selecionar unidade"
        onSubmit={loadCatalog}
      >
        <Field
          id="scheduleUnitId"
          label="Unidade (id)"
          value={unitId}
          onChange={changeUnit}
          required
        />
        <ErrorBanner message={catalogError} />
        <button type="submit" disabled={catalogLoading}>
          {catalogLoading ? "Carregando..." : "Carregar catálogo"}
        </button>
      </CardForm>

      {catalogLoaded ? (
        <div
          className="grid-2"
          style={{ marginTop: 24 }}
          aria-label="Catálogo da unidade"
        >
          <article className="card wide">
            <h3>Profissionais</h3>
            {providers.length === 0 ? (
              <EmptyState message="Nenhum profissional cadastrado nesta unidade." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id}>
                      <td>{provider.displayName}</td>
                      <td>
                        <code>{provider.id}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          <article className="card wide">
            <h3>Recursos</h3>
            {resources.length === 0 ? (
              <EmptyState message="Nenhum recurso cadastrado nesta unidade." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => (
                    <tr key={resource.id}>
                      <td>{resource.name}</td>
                      <td>{resource.kind}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </div>
      ) : null}

      <div className="grid-2" style={{ marginTop: 24 }}>
        <CardForm
          title="Cadastrar profissional"
          label="Cadastrar profissional"
          onSubmit={createProvider}
        >
          <Field
            id="providerUserId"
            label="Usuário do profissional (id)"
            value={providerUserId}
            onChange={setProviderUserId}
            required
          />
          <Field
            id="providerName"
            label="Nome de exibição"
            value={providerName}
            onChange={setProviderName}
            required
          />
          <ErrorBanner message={providerError} />
          {providerMessage ? (
            <p className="notice" role="status">
              {providerMessage}
            </p>
          ) : null}
          <button type="submit" disabled={creatingProvider}>
            {creatingProvider ? "Cadastrando..." : "Cadastrar profissional"}
          </button>
        </CardForm>

        <CardForm
          title="Cadastrar recurso"
          label="Cadastrar recurso"
          onSubmit={createResource}
        >
          <Field
            id="resourceName"
            label="Nome do recurso"
            value={resourceName}
            onChange={setResourceName}
            required
          />
          <Field
            id="resourceKind"
            label="Tipo do recurso (ex.: cadeira)"
            value={resourceKind}
            onChange={setResourceKind}
            required
          />
          <ErrorBanner message={resourceError} />
          {resourceMessage ? (
            <p className="notice" role="status">
              {resourceMessage}
            </p>
          ) : null}
          <button type="submit" disabled={creatingResource}>
            {creatingResource ? "Cadastrando..." : "Cadastrar recurso"}
          </button>
        </CardForm>
      </div>

      <div className="grid-2" style={{ marginTop: 24 }}>
        <CardForm
          title="Disponibilidade"
          label="Registrar disponibilidade"
          onSubmit={addAvailability}
        >
          <SelectField
            id="availabilityProvider"
            label="Profissional"
            value={availabilityProviderId}
            onChange={setAvailabilityProviderId}
            options={currentProviderOptions}
          />
          <SelectField
            id="availabilityResource"
            label="Recurso (opcional)"
            value={availabilityResourceId}
            onChange={setAvailabilityResourceId}
            options={currentResourceOptions}
          />
          <SelectField
            id="availabilityKind"
            label="Tipo da janela"
            value={availabilityKind}
            onChange={(value) => setAvailabilityKind(value as AvailabilityKind)}
            options={AVAILABILITY_KINDS}
          />
          <Field
            id="availabilityStartsAt"
            label="Início da janela"
            type="datetime-local"
            value={availabilityStartsAt}
            onChange={setAvailabilityStartsAt}
            required
          />
          <Field
            id="availabilityEndsAt"
            label="Fim da janela"
            type="datetime-local"
            value={availabilityEndsAt}
            onChange={setAvailabilityEndsAt}
            required
          />
          <ErrorBanner message={availabilityError} />
          {availabilityMessage ? (
            <p className="notice" role="status">
              {availabilityMessage}
            </p>
          ) : null}
          <button type="submit" disabled={creatingAvailability || providers.length === 0}>
            {creatingAvailability ? "Registrando..." : "Registrar janela"}
          </button>
        </CardForm>

        <CardForm
          title="Novo agendamento"
          label="Novo agendamento"
          onSubmit={bookAppointment}
        >
          <Field
            id="bookingPatientId"
            label="Paciente (id)"
            value={patientId}
            onChange={setPatientId}
            required
          />
          <SelectField
            id="bookingProvider"
            label="Profissional"
            value={bookingProviderId}
            onChange={setBookingProviderId}
            options={currentProviderOptions}
          />
          <SelectField
            id="bookingResource"
            label="Recurso (opcional)"
            value={bookingResourceId}
            onChange={setBookingResourceId}
            options={currentResourceOptions}
          />
          <Field
            id="bookingStartsAt"
            label="Início da consulta"
            type="datetime-local"
            value={bookingStartsAt}
            onChange={setBookingStartsAt}
            required
          />
          <Field
            id="bookingEndsAt"
            label="Fim da consulta"
            type="datetime-local"
            value={bookingEndsAt}
            onChange={setBookingEndsAt}
            required
          />
          <ErrorBanner message={bookingError} />
          {appointment ? (
            <div className="notice" role="status">
              Agendamento criado — <StatusBadge status={appointment.status} />
            </div>
          ) : null}
          <button type="submit" disabled={booking || providers.length === 0}>
            {booking ? "Agendando..." : "Agendar"}
          </button>
        </CardForm>
      </div>
    </section>
  );
}
