/**
 * Definicao de rotas. Rotas privadas ficam sob RequireAuth + AppLayout.
 */

import { Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { PatientsPage } from "./pages/PatientsPage.js";
import { SchedulePage } from "./pages/SchedulePage.js";
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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pacientes" element={<PatientsPage />} />
        <Route path="/agenda" element={<SchedulePage />} />
      </Route>
    </Routes>
  );
}
