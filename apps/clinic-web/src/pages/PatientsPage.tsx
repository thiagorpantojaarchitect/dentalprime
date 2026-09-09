/**
 * Pagina de pacientes: cadastro de novo paciente e consulta por id.
 *
 * Consome patient-record. O backend valida CPF e isolamento por tenant; aqui
 * apenas coletamos os dados e exibimos o resultado/erro de forma amigavel.
 */

import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client.js";
import type { Patient } from "../api/types.js";
import { useServices } from "../api/use-services.js";

export function PatientsPage(): JSX.Element {
  const { patients } = useServices();

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [created, setCreated] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setCreated(null);
    setSubmitting(true);
    try {
      const { id } = await patients.register({
        fullName,
        cpf,
        email: email || null,
        phone: phone || null,
      });
      const patient = await patients.getById(id);
      setCreated(patient);
      setFullName("");
      setCpf("");
      setEmail("");
      setPhone("");
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

  return (
    <section>
      <h2>Pacientes</h2>
      <form
        className="card"
        onSubmit={(e) => void onSubmit(e)}
        aria-label="Cadastrar paciente"
      >
        <h3>Novo paciente</h3>
        <div className="field">
          <label htmlFor="fullName">Nome completo</label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="cpf">CPF</label>
          <input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="phone">Telefone</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Salvando..." : "Cadastrar"}
        </button>
      </form>

      {created && (
        <div className="card" style={{ marginTop: 24 }} aria-label="Paciente cadastrado">
          <h3>Paciente cadastrado</h3>
          <p>
            <strong>{created.fullName}</strong> — CPF {created.cpf}
          </p>
        </div>
      )}
    </section>
  );
}
