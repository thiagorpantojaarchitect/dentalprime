/**
 * Definicao de rotas. Rotas privadas ficam sob RequireAuth + AppLayout.
 */

import { Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth.js";
import { AiFrontDeskPage } from "./pages/AiFrontDeskPage.js";
import { CrmPage } from "./pages/CrmPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { FinancePage } from "./pages/FinancePage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { PatientDetailPage } from "./pages/PatientDetailPage.js";
import { PatientsPage } from "./pages/PatientsPage.js";
import { SchedulePage } from "./pages/SchedulePage.js";
import { TreatmentsPage } from "./pages/TreatmentsPage.js";
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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pacientes" element={<PatientsPage />} />
        <Route path="/pacientes/:patientId" element={<PatientDetailPage />} />
        <Route path="/agenda" element={<SchedulePage />} />
        <Route path="/tratamentos" element={<TreatmentsPage />} />
        <Route path="/financeiro" element={<FinancePage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/recepcao-ia" element={<AiFrontDeskPage />} />
        <Route path="/usuarios" element={<UsersPage />} />
      </Route>
    </Routes>
  );
}
