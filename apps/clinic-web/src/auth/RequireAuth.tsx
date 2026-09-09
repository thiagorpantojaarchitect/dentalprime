/**
 * Guarda de rota: redireciona para /login quando nao autenticado.
 */

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "./auth-context.js";

export function RequireAuth({ children }: { readonly children: ReactNode }): JSX.Element {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
