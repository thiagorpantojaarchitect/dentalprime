/**
 * Recepcao por IA: conversa assistiva, triagem e sugestoes de agendamento.
 *
 * Consome ai-front-desk. A IA e claramente identificada ao usuario e nunca
 * decide clinicamente: conteudo clinico e bloqueado (CLINICAL_CONTENT_BLOCKED,
 * 422) e vira handoff humano. Sugestoes exigem revisao humana.
 */

import { useState } from "react";

import { ApiError } from "../api/client.js";
import type { AiChannel, CreatedConversation } from "../api/types.js";
import { useServices } from "../api/use-services.js";
import {
  CardForm,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  SelectField,
  StatusBadge,
  TextAreaField,
} from "../ui/components.js";

interface ChatLine {
  readonly author: "voce" | "ia" | "sistema";
  readonly text: string;
}

const CHANNELS = [
  { value: "chat", label: "Chat" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "web", label: "Web" },
  { value: "voice", label: "Voz" },
];

function aiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "CLINICAL_CONTENT_BLOCKED") {
      return "Conteúdo clínico: a IA não responde e encaminha para atendimento humano.";
    }
    if (err.code === "VALIDATION") return "Dados inválidos.";
    if (err.code === "NOT_FOUND") return "Conversa não encontrada.";
  }
  return fallback;
}

export function AiFrontDeskPage(): JSX.Element {
  const { ai } = useServices();

  const [channel, setChannel] = useState<string>("chat");
  const [conversation, setConversation] = useState<CreatedConversation | null>(null);
  const [convError, setConvError] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [lines, setLines] = useState<readonly ChatLine[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);

  const [triageText, setTriageText] = useState("");
  const [triageResult, setTriageResult] = useState<string | null>(null);
  const [triageError, setTriageError] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    setConvError(null);
    try {
      const conv = await ai.startConversation(channel as AiChannel);
      setConversation(conv);
      setLines([{ author: "sistema", text: "Conversa iniciada com a recepção por IA." }]);
    } catch (err) {
      setConvError(aiError(err, "Não foi possível iniciar a conversa."));
    }
  };

  const send = async (): Promise<void> => {
    if (!conversation) return;
    setChatError(null);
    const outgoing = message;
    setLines((prev) => [...prev, { author: "voce", text: outgoing }]);
    setMessage("");
    try {
      const res = await ai.sendMessage(conversation.id, outgoing);
      setLines((prev) => [
        ...prev,
        { author: "ia", text: res.reply.content },
        ...(res.handedOff
          ? [{ author: "sistema" as const, text: "Encaminhado para atendimento humano." }]
          : []),
      ]);
    } catch (err) {
      const msg = aiError(err, "Não foi possível enviar a mensagem.");
      setChatError(msg);
      setLines((prev) => [...prev, { author: "sistema", text: msg }]);
    }
  };

  const triage = async (): Promise<void> => {
    setTriageError(null);
    setTriageResult(null);
    try {
      const res = await ai.triage(triageText);
      setTriageResult(
        `Urgência ${res.perceivedUrgency}. ${res.recommendHandoff ? "Recomenda atendimento humano. " : ""}${res.reason}`,
      );
    } catch (err) {
      setTriageError(aiError(err, "Não foi possível triar."));
    }
  };

  return (
    <section>
      <PageHeader
        title="Recepção IA"
        subtitle="Atendimento assistivo por IA. Identificado como IA e sem decisão clínica."
        actions={<StatusBadge status="IA assistiva" variant="ai" />}
      />

      {!conversation ? (
        <CardForm title="Iniciar conversa" label="Iniciar conversa" onSubmit={start}>
          <SelectField
            id="convChannel"
            label="Canal"
            value={channel}
            onChange={setChannel}
            options={CHANNELS}
          />
          <ErrorBanner message={convError} />
          <button type="submit">Iniciar</button>
        </CardForm>
      ) : (
        <div className="card wide stack" aria-label="Conversa">
          <div className="row">
            <h3 style={{ margin: 0 }}>Conversa</h3>
            <StatusBadge status={conversation.status} />
          </div>

          <div className="stack">
            {lines.length === 0 ? (
              <EmptyState message="Sem mensagens." />
            ) : (
              lines.map((line, idx) => (
                <p key={idx} className={line.author === "ia" ? "notice" : ""}>
                  <strong>
                    {line.author === "voce"
                      ? "Você"
                      : line.author === "ia"
                        ? "IA"
                        : "Sistema"}
                    :
                  </strong>{" "}
                  {line.text}
                </p>
              ))
            )}
          </div>

          <CardForm title="Enviar mensagem" label="Enviar mensagem" onSubmit={send}>
            <Field
              id="msg"
              label="Mensagem"
              value={message}
              onChange={setMessage}
              required
            />
            <ErrorBanner message={chatError} />
            <button type="submit">Enviar</button>
          </CardForm>
        </div>
      )}

      <CardForm title="Triagem" label="Triagem" onSubmit={triage}>
        <TextAreaField
          id="triage"
          label="Descrição do contato"
          value={triageText}
          onChange={setTriageText}
          required
        />
        <ErrorBanner message={triageError} />
        {triageResult ? <p className="notice">{triageResult}</p> : null}
        <button type="submit">Triar</button>
      </CardForm>
    </section>
  );
}
