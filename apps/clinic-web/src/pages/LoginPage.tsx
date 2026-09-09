/**
 * Pagina de login. Autentica via identity-access (tenant + email + senha) e,
 * em sucesso, redireciona para o inicio. Mensagens de erro sao genericas.
 */

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/auth-context.js";

export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(tenantId, email, password);
      navigate("/", { replace: true });
    } catch (err) {
      // Mensagem generica: nao revelar qual fator falhou.
      setError(
        err instanceof ApiError && err.status === 401
          ? "Credenciais invalidas."
          : "Nao foi possivel entrar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card" onSubmit={(e) => void onSubmit(e)} aria-label="Entrar">
        <h2>Entrar</h2>
        <div className="field">
          <label htmlFor="tenantId">Clínica (tenant)</label>
          <input
            id="tenantId"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
