/**
 * Definicao de rotas do admin-portal. Rotas privadas ficam sob RequireAuth +
 * AppLayout.
 */

import { Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { OverviewPage } from "./pages/OverviewPage.js";
import { TenantsPage } from "./pages/TenantsPage.js";
import { UnitsPage } from "./pages/UnitsPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { AppLayout } from "./ui/AppLayout.js";

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<OverviewPage />} />
        <Route path="/unidades" element={<UnitsPage />} />
        <Route path="/usuarios" element={<UsersPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
      </Route>
    </Routes>
  );
}
