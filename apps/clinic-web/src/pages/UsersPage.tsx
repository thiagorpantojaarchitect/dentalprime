/**
 * Administracao de usuarios (RBAC): convidar, desativar e trocar papel.
 * Consome identity-access. Os papeis controlam o acesso por tenant.
 */

import { useState } from "react";

import { ApiError } from "../api/client.js";
import type { CreatedUser, Role } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  ErrorBanner,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
} from "../ui/components.js";

const ROLES: ReadonlyArray<{ readonly value: Role; readonly label: string }> = [
  { value: "owner", label: "Proprietário(a)" },
  { value: "manager", label: "Gerente" },
  { value: "dentist", label: "Dentista" },
  { value: "specialist", label: "Especialista" },
  { value: "assistant", label: "Auxiliar" },
  { value: "front-desk", label: "Recepção" },
  { value: "patient", label: "Paciente" },
];

function usersError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN")
      return "Você não tem permissão para gerenciar usuários.";
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "CONFLICT") return "Já existe um usuário com este e-mail.";
    if (err.code === "NOT_FOUND") return "Usuário não encontrado.";
  }
  return fallback;
}

export function UsersPage(): JSX.Element {
  const { users } = useServices();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<string>("assistant");
  const [invited, setInvited] = useState<CreatedUser | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [newRole, setNewRole] = useState<string>("dentist");
  const [manageMsg, setManageMsg] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  const invite = async (): Promise<void> => {
    setInviteError(null);
    try {
      setInvited(await users.invite({ email, displayName, role: role as Role }));
      setEmail("");
      setDisplayName("");
    } catch (err) {
      setInviteError(usersError(err, "Não foi possível convidar o usuário."));
    }
  };

  const changeRole = async (): Promise<void> => {
    setManageError(null);
    setManageMsg(null);
    try {
      await users.changeRole(userId, newRole as Role, null);
      setManageMsg("Papel atualizado.");
    } catch (err) {
      setManageError(usersError(err, "Não foi possível alterar o papel."));
    }
  };

  const deactivate = async (): Promise<void> => {
    setManageError(null);
    setManageMsg(null);
    try {
      await users.deactivate(userId);
      setManageMsg("Usuário desativado.");
    } catch (err) {
      setManageError(usersError(err, "Não foi possível desativar o usuário."));
    }
  };

  return (
    <section>
      <PageHeader
        title="Usuários"
        subtitle="Convide a equipe e gerencie papéis (RBAC) por tenant."
      />

      <div className="grid-2">
        <CardForm title="Convidar usuário" label="Convidar usuário" onSubmit={invite}>
          <Field
            id="userEmail"
            label="E-mail"
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
          <Field
            id="userName"
            label="Nome"
            value={displayName}
            onChange={setDisplayName}
            required
          />
          <SelectField
            id="userRole"
            label="Papel"
            value={role}
            onChange={setRole}
            options={ROLES}
          />
          <ErrorBanner message={inviteError} />
          {invited ? (
            <p className="muted">
              Convite enviado — <StatusBadge status={invited.status} />
            </p>
          ) : null}
          <button type="submit">Convidar</button>
        </CardForm>

        <CardForm
          title="Gerenciar usuário"
          label="Gerenciar usuário"
          onSubmit={changeRole}
        >
          <Field
            id="mgUserId"
            label="ID do usuário"
            value={userId}
            onChange={setUserId}
            required
          />
          <SelectField
            id="mgRole"
            label="Novo papel"
            value={newRole}
            onChange={setNewRole}
            options={ROLES}
          />
          <ErrorBanner message={manageError} />
          {manageMsg ? <p className="muted">{manageMsg}</p> : null}
          <div className="row">
            <button type="submit">Alterar papel</button>
            <button type="button" className="danger" onClick={() => void deactivate()}>
              Desativar
            </button>
          </div>
        </CardForm>
      </div>
    </section>
  );
}
