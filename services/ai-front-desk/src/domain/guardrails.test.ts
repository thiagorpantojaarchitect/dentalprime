import { describe, it, expect } from "vitest";
import { requestsClinicalContent } from "./guardrails.js";

describe("requestsClinicalContent", () => {
  it("detecta pedido de diagnostico/prescricao (com e sem acento)", () => {
    expect(requestsClinicalContent("Qual o diagnostico do meu dente?")).toBe(true);
    expect(requestsClinicalContent("Pode me receitar um antibiotico?")).toBe(true);
    expect(requestsClinicalContent("Qual remedio devo tomar?")).toBe(true);
    expect(requestsClinicalContent("Preciso de uma prescricao")).toBe(true);
  });

  it("nao bloqueia mensagens administrativas comuns", () => {
    expect(requestsClinicalContent("Quero marcar uma consulta")).toBe(false);
    expect(requestsClinicalContent("Qual o horario de funcionamento?")).toBe(false);
    expect(requestsClinicalContent("Voces atendem no sabado?")).toBe(false);
  });
});
