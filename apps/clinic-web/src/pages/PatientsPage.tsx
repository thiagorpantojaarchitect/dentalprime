/**
 * Pagina de pacientes: cadastro de novo paciente e busca por id para abrir o
 * prontuario. Consome patient-record. O backend valida CPF e isolamento por
 * tenant; aqui coletamos os dados e exibimos resultado/erro de forma amigavel.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { useServices } from "../api/use-services.js";
import { CardForm, ErrorBanner, Field, PageHeader } from "../ui/components.js";

export function PatientsPage(): JSX.Element {
  const { patients } = useServices();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [lookupId, setLookupId] = useState("");

  const register = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      const { id } = await patients.register({
        fullName,
        cpf,
        email: email || null,
        phone: phone || null,
      });
      navigate(`/pacientes/${id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION") {
        setError("Dados inválidos. Verifique o CPF e o nome.");
      } else if (err instanceof ApiError && err.code === "CONFLICT") {
        setError("Já existe um paciente com este CPF.");
      } else {
        setError("Não foi possível cadastrar o paciente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openLookup = (): void => {
    const id = lookupId.trim();
    if (id) navigate(`/pacientes/${id}`);
  };

  return (
    <section>
      <PageHeader
        title="Pacientes"
        subtitle="Cadastre pacientes e acesse o prontuário clínico."
      />

      <div className="grid-2">
        <CardForm title="Novo paciente" label="Cadastrar paciente" onSubmit={register}>
          <Field
            id="fullName"
            label="Nome completo"
            value={fullName}
            onChange={setFullName}
            required
          />
          <Field id="cpf" label="CPF" value={cpf} onChange={setCpf} required />
          <Field
            id="email"
            label="E-mail"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <Field id="phone" label="Telefone" value={phone} onChange={setPhone} />
          <ErrorBanner message={error} />
          <button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Cadastrar"}
          </button>
        </CardForm>

        <CardForm
          title="Abrir prontuário"
          label="Buscar paciente"
          onSubmit={() => openLookup()}
        >
          <Field
            id="lookupId"
            label="ID do paciente"
            value={lookupId}
            onChange={setLookupId}
            required
          />
          <button type="submit" className="secondary">
            Abrir
          </button>
        </CardForm>
      </div>
    </section>
  );
}
