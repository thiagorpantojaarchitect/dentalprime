/** Ativacao publica de convite com token expiravel e de uso unico. */

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/auth-context.js";

function activationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NOT_FOUND") return "Convite inválido ou expirado.";
    if (error.code === "CONFLICT") return "Este convite já foi utilizado.";
    if (error.code === "VALIDATION") return "Revise os dados informados.";
  }
  return "Não foi possível ativar a conta. Tente novamente.";
}

export function ActivationPage(): JSX.Element {
  const { activate } = useAuth();
  const [tenantId, setTenantId] = useState("");
  const [activationToken, setActivationToken] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    try {
      await activate(tenantId.trim(), activationToken.trim(), password);
      setActivationToken("");
      setPassword("");
      setPasswordConfirmation("");
      setActivated(true);
    } catch (err) {
      setError(activationError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card" onSubmit={(event) => void onSubmit(event)}>
        <h2>Ativar conta</h2>
        <p className="muted">
          Use o tenant e o token recebidos no convite. O token só pode ser usado uma vez.
        </p>
        <div className="field">
          <label htmlFor="activationTenant">Clínica (tenant)</label>
          <input
            id="activationTenant"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            required
            autoComplete="organization"
          />
        </div>
        <div className="field">
          <label htmlFor="activationToken">Token de convite</label>
          <input
            id="activationToken"
            type="password"
            value={activationToken}
            onChange={(event) => setActivationToken(event.target.value)}
            required
            minLength={32}
            maxLength={256}
            autoComplete="one-time-code"
          />
        </div>
        <div className="field">
          <label htmlFor="activationPassword">Nova senha</label>
          <input
            id="activationPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label htmlFor="activationPasswordConfirmation">Confirmar senha</label>
          <input
            id="activationPasswordConfirmation"
            type="password"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {activated ? (
          <p className="notice" role="status">
            Conta ativada. <Link to="/login">Entrar agora</Link>.
          </p>
        ) : (
          <button type="submit" disabled={submitting}>
            {submitting ? "Ativando..." : "Ativar conta"}
          </button>
        )}
      </form>
    </div>
  );
}
