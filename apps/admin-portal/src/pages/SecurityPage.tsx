import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { useServices } from "../api/use-services.js";
import { useAuth } from "../auth/auth-context.js";
import { CardForm, ErrorBanner, Field, PageHeader } from "../ui/components.js";

function passwordError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "A senha atual não confere.";
    if (error.code === "CONFLICT") return "A nova senha deve ser diferente da atual.";
    if (error.code === "VALIDATION")
      return "Use uma nova senha com ao menos 12 caracteres.";
  }
  return "Não foi possível alterar a senha.";
}

export function SecurityPage(): JSX.Element {
  const { network } = useServices();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    if (newPassword !== confirmation) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    setSubmitting(true);
    try {
      await network.changeOwnPassword(currentPassword, newPassword);
      await logout();
      navigate("/login?senha=alterada", { replace: true });
    } catch (caught) {
      setError(passwordError(caught));
      setSubmitting(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="Segurança"
        subtitle="Troque sua senha. Todas as sessões renováveis serão encerradas."
      />
      <CardForm title="Alterar senha" label="Alterar senha" onSubmit={submit}>
        <Field
          id="currentPassword"
          label="Senha atual"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          required
        />
        <Field
          id="newPassword"
          label="Nova senha"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          required
        />
        <Field
          id="passwordConfirmation"
          label="Confirme a nova senha"
          type="password"
          value={confirmation}
          onChange={setConfirmation}
          required
        />
        <ErrorBanner message={error} />
        <button type="submit" disabled={submitting}>
          {submitting ? "Alterando..." : "Alterar senha"}
        </button>
      </CardForm>
    </section>
  );
}
