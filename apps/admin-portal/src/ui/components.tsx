/**
 * Componentes de UI compartilhados pelo admin-portal. Pequenos, testaveis e
 * reaproveitando as classes utilitarias de styles.css.
 */

import type { ChangeEvent, FormEvent, ReactNode } from "react";

/** Cabecalho de pagina com titulo, subtitulo opcional e area de acoes. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

/** Mensagem de erro amigavel (nao exibe stack nem detalhes internos). */
export function ErrorBanner({
  message,
}: {
  readonly message: string | null;
}): JSX.Element | null {
  if (!message) return null;
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

/** Campo de formulario com label associado. */
export function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: string;
  readonly required?: boolean;
}): JSX.Element {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Selo de status com variante visual. */
export function StatusBadge({
  status,
  variant = "default",
}: {
  readonly status: string;
  readonly variant?: "default" | "success" | "warning" | "danger";
}): JSX.Element {
  const cls = variant === "default" ? "badge" : `badge ${variant}`;
  return <span className={cls}>{status}</span>;
}

/** Estado vazio para listas. */
export function EmptyState({ message }: { readonly message: string }): JSX.Element {
  return <p className="empty">{message}</p>;
}

/** Formulario em cartao com titulo e handler de submit assincrono. */
export function CardForm({
  title,
  label,
  onSubmit,
  children,
}: {
  readonly title: string;
  readonly label: string;
  readonly onSubmit: () => void | Promise<void>;
  readonly children: ReactNode;
}): JSX.Element {
  const handle = (event: FormEvent): void => {
    event.preventDefault();
    void onSubmit();
  };
  return (
    <form className="card" aria-label={label} onSubmit={handle}>
      <h3>{title}</h3>
      {children}
    </form>
  );
}
