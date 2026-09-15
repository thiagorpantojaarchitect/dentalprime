/**
 * Pagina de login do admin-portal. Autentica via identity-access
 * (tenant + email + senha). Requer papel administrativo (owner/manager) para
 * acessar a maioria das operacoes; o RBAC e aplicado pelo backend.
 */

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/auth-context.js";

export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
        <h2>Administração</h2>
        {searchParams.get("senha") === "alterada" ? (
          <p className="notice" role="status">
            Senha alterada. Entre novamente.
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="tenantId">Tenant</label>
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
        <p className="muted">
          Primeiro acesso? <Link to="/ativar">Ative seu convite</Link>.
        </p>
      </form>
    </div>
  );
}
