/**
 * Prontuario do paciente com abas: dados, prontuario clinico (versionado),
 * anamnese, odontograma, consentimento e direitos LGPD.
 *
 * Consome patient-record. Registros clinicos sao append-only: correcoes criam
 * uma nova versao, preservando o historico (seguranca clinica). Acesso a dado
 * sensivel sem consentimento valido retorna CONSENT_REQUIRED (451).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "../api/client.js";
import type {
  Anamnesis,
  ClinicalRecord,
  OdontogramEntry,
  Patient,
} from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  StatusBadge,
  TextAreaField,
} from "../ui/components.js";

type Tab = "dados" | "prontuario" | "anamnese" | "odontograma" | "consentimento" | "lgpd";

function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "CONSENT_REQUIRED") {
      return "Consentimento do paciente necessário para acessar este dado.";
    }
    if (err.code === "NOT_FOUND") return "Paciente não encontrado.";
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "FORBIDDEN") return "Você não tem permissão para esta ação.";
  }
  return fallback;
}

export function PatientDetailPage(): JSX.Element {
  const { patientId = "" } = useParams();
  const { patients } = useServices();

  const [tab, setTab] = useState<Tab>("dados");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPatient = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setPatient(await patients.getById(patientId));
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar o paciente."));
    }
  }, [patients, patientId]);

  useEffect(() => {
    void loadPatient();
  }, [loadPatient]);

  const tabs: ReadonlyArray<{ readonly id: Tab; readonly label: string }> = [
    { id: "dados", label: "Dados" },
    { id: "prontuario", label: "Prontuário" },
    { id: "anamnese", label: "Anamnese" },
    { id: "odontograma", label: "Odontograma" },
    { id: "consentimento", label: "Consentimento" },
    { id: "lgpd", label: "LGPD" },
  ];

  return (
    <section>
      <PageHeader
        title={patient ? patient.fullName : "Paciente"}
        subtitle={patient ? `CPF ${patient.cpf}` : `ID ${patientId}`}
        actions={
          patient ? (
            <StatusBadge
              status={patient.active ? "ativo" : "inativo"}
              variant={patient.active ? "success" : "danger"}
            />
          ) : undefined
        }
      />

      <ErrorBanner message={error} />

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dados" && patient ? (
        <PatientDataTab patient={patient} onSaved={loadPatient} />
      ) : null}
      {tab === "prontuario" ? <ClinicalRecordsTab patientId={patientId} /> : null}
      {tab === "anamnese" ? <AnamnesisTab patientId={patientId} /> : null}
      {tab === "odontograma" ? <OdontogramTab patientId={patientId} /> : null}
      {tab === "consentimento" ? <ConsentTab patientId={patientId} /> : null}
      {tab === "lgpd" ? <LgpdTab patientId={patientId} /> : null}
    </section>
  );
}

function PatientDataTab({
  patient,
  onSaved,
}: {
  readonly patient: Patient;
  readonly onSaved: () => void | Promise<void>;
}): JSX.Element {
  const { patients } = useServices();
  const [fullName, setFullName] = useState(patient.fullName);
  const [email, setEmail] = useState(patient.email ?? "");
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    try {
      await patients.update(patient.id, {
        fullName,
        email: email || null,
        phone: phone || null,
      });
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar."));
    }
  };

  return (
    <CardForm title="Editar dados" label="Editar paciente" onSubmit={save}>
      <Field
        id="fullName"
        label="Nome completo"
        value={fullName}
        onChange={setFullName}
        required
      />
      <Field id="email" label="E-mail" type="email" value={email} onChange={setEmail} />
      <Field id="phone" label="Telefone" value={phone} onChange={setPhone} />
      <ErrorBanner message={error} />
      {saved ? <p className="muted">Dados atualizados.</p> : null}
      <button type="submit">Salvar</button>
    </CardForm>
  );
}

function ClinicalRecordsTab({ patientId }: { readonly patientId: string }): JSX.Element {
  const { patients } = useServices();
  const [records, setRecords] = useState<readonly ClinicalRecord[]>([]);
  const [entryType, setEntryType] = useState("evolucao");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setRecords(await patients.listClinicalRecords(patientId));
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar o prontuário."));
    }
  }, [patients, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (): Promise<void> => {
    setError(null);
    try {
      await patients.addClinicalRecord(patientId, entryType, content);
      setContent("");
      await load();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível registrar."));
    }
  };

  return (
    <div className="stack">
      <CardForm title="Nova evolução" label="Registrar evolução" onSubmit={add}>
        <Field
          id="entryType"
          label="Tipo"
          value={entryType}
          onChange={setEntryType}
          required
        />
        <TextAreaField
          id="content"
          label="Conteúdo"
          value={content}
          onChange={setContent}
          required
        />
        <ErrorBanner message={error} />
        <p className="notice">
          Registros clínicos são preservados. Correções criam uma nova versão sem apagar o
          histórico.
        </p>
        <button type="submit">Registrar</button>
      </CardForm>

      <div className="card wide">
        <h3>Histórico</h3>
        {records.length === 0 ? (
          <EmptyState message="Nenhum registro ainda." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Conteúdo</th>
                <th>Versão</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.recordKey}>
                  <td>{r.entryType ?? "-"}</td>
                  <td>{r.content ?? "-"}</td>
                  <td>v{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AnamnesisTab({ patientId }: { readonly patientId: string }): JSX.Element {
  const { patients } = useServices();
  const [current, setCurrent] = useState<Anamnesis | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const anamnesis = await patients.getAnamnesis(patientId);
      setCurrent(anamnesis);
      setText(anamnesis?.answers ? JSON.stringify(anamnesis.answers, null, 2) : "");
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar a anamnese."));
    }
  }, [patients, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    let answers: Record<string, unknown>;
    try {
      answers = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      setError("A anamnese deve ser um JSON válido.");
      return;
    }
    try {
      await patients.saveAnamnesis(patientId, answers);
      setSaved(true);
      await load();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar a anamnese."));
    }
  };

  return (
    <CardForm title="Anamnese" label="Salvar anamnese" onSubmit={save}>
      <p className="muted">
        Versão atual: {current ? `v${current.version}` : "nenhuma"}.
      </p>
      <TextAreaField
        id="anamnesis"
        label="Respostas (JSON)"
        value={text}
        onChange={setText}
        rows={8}
      />
      <ErrorBanner message={error} />
      {saved ? <p className="muted">Anamnese salva.</p> : null}
      <button type="submit">Salvar</button>
    </CardForm>
  );
}

function OdontogramTab({ patientId }: { readonly patientId: string }): JSX.Element {
  const { patients } = useServices();
  const [entries, setEntries] = useState<readonly OdontogramEntry[]>([]);
  const [toothNumber, setToothNumber] = useState("");
  const [surface, setSurface] = useState("");
  const [condition, setCondition] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setEntries(await patients.listOdontogram(patientId));
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar o odontograma."));
    }
  }, [patients, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (): Promise<void> => {
    setError(null);
    const tooth = Number(toothNumber);
    if (!Number.isInteger(tooth)) {
      setError("Número do dente inválido.");
      return;
    }
    try {
      await patients.addOdontogramEntry(patientId, {
        toothNumber: tooth,
        surface: surface || null,
        condition,
      });
      setToothNumber("");
      setSurface("");
      setCondition("");
      await load();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível registrar."));
    }
  };

  return (
    <div className="stack">
      <CardForm title="Novo lançamento" label="Registrar odontograma" onSubmit={add}>
        <Field
          id="tooth"
          label="Dente (número)"
          type="number"
          value={toothNumber}
          onChange={setToothNumber}
          required
        />
        <Field
          id="surface"
          label="Face (opcional)"
          value={surface}
          onChange={setSurface}
        />
        <Field
          id="condition"
          label="Condição"
          value={condition}
          onChange={setCondition}
          required
        />
        <ErrorBanner message={error} />
        <button type="submit">Registrar</button>
      </CardForm>

      <div className="card wide">
        <h3>Lançamentos</h3>
        {entries.length === 0 ? (
          <EmptyState message="Nenhum lançamento ainda." />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Dente</th>
                <th>Face</th>
                <th>Condição</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.toothNumber}</td>
                  <td>{e.surface ?? "-"}</td>
                  <td>{e.condition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ConsentTab({ patientId }: { readonly patientId: string }): JSX.Element {
  const { patients } = useServices();
  const [purpose, setPurpose] = useState("tratamento");
  const [termVersion, setTermVersion] = useState("1.0");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grant = async (): Promise<void> => {
    setError(null);
    try {
      const res = await patients.grantConsent(patientId, purpose, termVersion);
      setStatus(`Consentimento ${res.status}.`);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível registrar o consentimento."));
    }
  };

  const revoke = async (): Promise<void> => {
    setError(null);
    try {
      const res = await patients.revokeConsent(patientId, purpose, termVersion);
      setStatus(`Consentimento ${res.status}.`);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível revogar o consentimento."));
    }
  };

  return (
    <CardForm
      title="Consentimento (LGPD)"
      label="Gerenciar consentimento"
      onSubmit={grant}
    >
      <Field
        id="purpose"
        label="Finalidade"
        value={purpose}
        onChange={setPurpose}
        required
      />
      <Field
        id="termVersion"
        label="Versão do termo"
        value={termVersion}
        onChange={setTermVersion}
        required
      />
      <ErrorBanner message={error} />
      {status ? <p className="muted">{status}</p> : null}
      <div className="row">
        <button type="submit">Conceder</button>
        <button type="button" className="danger" onClick={() => void revoke()}>
          Revogar
        </button>
      </div>
    </CardForm>
  );
}

function LgpdTab({ patientId }: { readonly patientId: string }): JSX.Element {
  const { patients } = useServices();
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const exportData = async (): Promise<void> => {
    setError(null);
    try {
      const data = await patients.exportData(patientId);
      setOutput(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(friendlyError(err, "Não foi possível exportar os dados."));
    }
  };

  const erase = async (): Promise<void> => {
    setError(null);
    try {
      const outcome = await patients.requestErasure(patientId);
      setOutput(JSON.stringify(outcome, null, 2));
      setConfirming(false);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível solicitar a eliminação."));
    }
  };

  return (
    <div className="card wide stack">
      <h3>Direitos do titular</h3>
      <p className="notice">
        Exportação atende ao direito de portabilidade. A eliminação respeita a guarda
        legal obrigatória do prontuário odontológico.
      </p>
      <div className="row">
        <button type="button" onClick={() => void exportData()}>
          Exportar dados
        </button>
        {confirming ? (
          <>
            <span className="muted">Confirmar eliminação?</span>
            <button type="button" className="danger" onClick={() => void erase()}>
              Confirmar
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="secondary" onClick={() => setConfirming(true)}>
            Solicitar eliminação
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
      {output ? (
        <pre className="notice" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
          {output}
        </pre>
      ) : null}
    </div>
  );
}
