/**
 * CRM e crescimento: leads, conversao, interacoes, campanhas e consentimento de
 * marketing (opt-in/opt-out). Consome crm-growth.
 */

import { useState } from "react";

import { ApiError } from "../api/client.js";
import type { CreatedLead, CrmChannel } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  ErrorBanner,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
} from "../ui/components.js";

function crmError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "NOT_FOUND") return "Registro não encontrado.";
    if (err.code === "FORBIDDEN") return "Sem permissão para esta ação.";
    if (err.code === "CONFLICT") return "Operação em conflito com o estado atual.";
  }
  return fallback;
}

const CHANNELS = [
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "in_person", label: "Presencial" },
];

export function CrmPage(): JSX.Element {
  const { crm } = useServices();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lead, setLead] = useState<CreatedLead | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);

  const [campaignName, setCampaignName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [channel, setChannel] = useState<string>("email");
  const [campaignMsg, setCampaignMsg] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const [contactRef, setContactRef] = useState("");
  const [consentPurpose, setConsentPurpose] = useState("marketing");
  const [consentMsg, setConsentMsg] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);

  const createLead = async (): Promise<void> => {
    setLeadError(null);
    try {
      setLead(
        await crm.createLead({
          name,
          email: email || null,
          phone: phone || null,
        }),
      );
      setName("");
      setEmail("");
      setPhone("");
    } catch (err) {
      setLeadError(crmError(err, "Não foi possível criar o lead."));
    }
  };

  const qualifyLead = async (): Promise<void> => {
    if (!lead) return;
    setLeadError(null);
    try {
      const res = await crm.setLeadStatus(lead.id, "qualified");
      setLead({ id: res.id, status: res.status });
    } catch (err) {
      setLeadError(crmError(err, "Não foi possível qualificar o lead."));
    }
  };

  const createCampaign = async (): Promise<void> => {
    setCampaignError(null);
    setCampaignMsg(null);
    try {
      await crm.createCampaign({
        name: campaignName,
        purpose,
        channel: channel as CrmChannel,
      });
      setCampaignMsg("Campanha criada.");
      setCampaignName("");
      setPurpose("");
    } catch (err) {
      setCampaignError(crmError(err, "Não foi possível criar a campanha."));
    }
  };

  const optIn = async (): Promise<void> => {
    setConsentError(null);
    setConsentMsg(null);
    try {
      const res = await crm.optIn(contactRef, consentPurpose, channel as CrmChannel);
      setConsentMsg(`Consentimento: ${res.decision}.`);
    } catch (err) {
      setConsentError(crmError(err, "Não foi possível registrar o consentimento."));
    }
  };

  const optOut = async (): Promise<void> => {
    setConsentError(null);
    setConsentMsg(null);
    try {
      const res = await crm.optOut(contactRef, consentPurpose, channel as CrmChannel);
      setConsentMsg(`Consentimento: ${res.decision}.`);
    } catch (err) {
      setConsentError(crmError(err, "Não foi possível registrar o opt-out."));
    }
  };

  return (
    <section>
      <PageHeader
        title="CRM"
        subtitle="Captação de leads, campanhas e consentimento de marketing (LGPD)."
      />

      <div className="grid-2">
        <CardForm title="Novo lead" label="Criar lead" onSubmit={createLead}>
          <Field id="leadName" label="Nome" value={name} onChange={setName} required />
          <Field
            id="leadEmail"
            label="E-mail"
            type="email"
            value={email}
            onChange={setEmail}
          />
          <Field id="leadPhone" label="Telefone" value={phone} onChange={setPhone} />
          <ErrorBanner message={leadError} />
          {lead ? (
            <p className="muted">
              Lead <StatusBadge status={lead.status} />{" "}
              <button type="button" className="link" onClick={() => void qualifyLead()}>
                qualificar
              </button>
            </p>
          ) : null}
          <button type="submit">Criar lead</button>
        </CardForm>

        <CardForm title="Nova campanha" label="Criar campanha" onSubmit={createCampaign}>
          <Field
            id="campName"
            label="Nome"
            value={campaignName}
            onChange={setCampaignName}
            required
          />
          <Field
            id="campPurpose"
            label="Finalidade"
            value={purpose}
            onChange={setPurpose}
            required
          />
          <SelectField
            id="campChannel"
            label="Canal"
            value={channel}
            onChange={setChannel}
            options={CHANNELS}
          />
          <ErrorBanner message={campaignError} />
          {campaignMsg ? <p className="muted">{campaignMsg}</p> : null}
          <button type="submit">Criar campanha</button>
        </CardForm>
      </div>

      <CardForm
        title="Consentimento de marketing"
        label="Gerenciar consentimento de marketing"
        onSubmit={optIn}
      >
        <Field
          id="contactRef"
          label="Contato (ref)"
          value={contactRef}
          onChange={setContactRef}
          required
        />
        <Field
          id="consentPurpose"
          label="Finalidade"
          value={consentPurpose}
          onChange={setConsentPurpose}
          required
        />
        <SelectField
          id="consentChannel"
          label="Canal"
          value={channel}
          onChange={setChannel}
          options={CHANNELS}
        />
        <ErrorBanner message={consentError} />
        {consentMsg ? <p className="muted">{consentMsg}</p> : null}
        <div className="row">
          <button type="submit">Opt-in</button>
          <button type="button" className="danger" onClick={() => void optOut()}>
            Opt-out
          </button>
        </div>
      </CardForm>
    </section>
  );
}
