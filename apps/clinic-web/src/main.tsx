/**
 * Ponto de entrada do frontend. Monta o AuthProvider (com SessionStore em
 * localStorage) e o roteador.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App.js";
import { AuthProvider } from "./auth/auth-context.js";
import { SessionStore } from "./auth/session-store.js";
import { getServiceUrls } from "./config.js";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Elemento #root nao encontrado.");
}

const store = new SessionStore(window.localStorage);
const urls = getServiceUrls();

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider identityUrl={urls.identity} store={store}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
