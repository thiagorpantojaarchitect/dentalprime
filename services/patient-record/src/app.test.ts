import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";

import { buildApp } from "./app.js";
import { buildServices, TENANT_A, VALID_CPF_1 } from "./application/test-helpers.js";

const JWT_SECRET = "test-secret-com-pelo-menos-32-caracteres!!";
const ISSUER = "dentalprime-identity-access";

/** Emite um access token como o identity-access faria (mesmo segredo e issuer). */
async function issueToken(roles: string[], userId = "user-1"): Promise<string> {
  const key = new TextEncoder().encode(JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ tenantId: TENANT_A, roles, units: [] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(key);
}

describe("patient-record API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const services = buildServices();
    app = await buildApp({ jwtSecret: JWT_SECRET, ...services });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health responde ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("rota protegida exige token (401 sem Authorization)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/patients",
      payload: { fullName: "Maria", cpf: VALID_CPF_1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("com token de dentista, cadastra e le paciente", async () => {
    const token = await issueToken(["dentist"]);
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: { fullName: "Maria Silva", cpf: VALID_CPF_1 },
    });
    expect(created.statusCode).toBe(201);
    const patientId = created.json().id as string;

    const got = await app.inject({
      method: "GET",
      url: `/patients/${patientId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().fullName).toBe("Maria Silva");
  });

  it("papel patient sem permissao recebe 403", async () => {
    const token = await issueToken(["patient"]);
    const res = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: { fullName: "Maria", cpf: VALID_CPF_1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("vincula o usuario por staff e entrega somente perfil e prontuario proprios", async () => {
    const portalUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const staffToken = await issueToken(["dentist"]);
    const staffHeaders = { authorization: `Bearer ${staffToken}` };
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers: staffHeaders,
      payload: { fullName: "Maria Portal", cpf: VALID_CPF_1 },
    });
    const patientId = created.json().id as string;
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/patients/${patientId}/portal-user`,
          headers: staffHeaders,
          payload: { portalUserId },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/patients/${patientId}/clinical-records`,
          headers: staffHeaders,
          payload: { entryType: "evolution", content: "Evolucao clinica." },
        })
      ).statusCode,
    ).toBe(201);

    const patientToken = await issueToken(["patient"], portalUserId);
    const patientHeaders = { authorization: `Bearer ${patientToken}` };
    const ownProfile = await app.inject({
      method: "GET",
      url: "/patients/me",
      headers: patientHeaders,
    });
    expect(ownProfile.statusCode).toBe(200);
    expect(ownProfile.json().id).toBe(patientId);

    const ownRecords = await app.inject({
      method: "GET",
      url: "/patients/me/clinical-records",
      headers: patientHeaders,
    });
    expect(ownRecords.statusCode).toBe(200);
    expect(ownRecords.json().records).toHaveLength(1);

    const genericRead = await app.inject({
      method: "GET",
      url: `/patients/${patientId}`,
      headers: patientHeaders,
    });
    expect(genericRead.statusCode).toBe(403);
  });

  it("patient sem vinculo nao recebe dados de outro cadastro", async () => {
    const token = await issueToken(["patient"], "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const response = await app.inject({
      method: "GET",
      url: "/patients/me/clinical-records",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("CPF invalido retorna 400", async () => {
    const token = await issueToken(["dentist"]);
    const res = await app.inject({
      method: "POST",
      url: "/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: { fullName: "Maria", cpf: "111.111.111-11" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("gera URLs assinadas para documento clinico com metadados validados", async () => {
    const token = await issueToken(["dentist"]);
    const headers = { authorization: `Bearer ${token}` };
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      payload: { fullName: "Pessoa de Teste", cpf: VALID_CPF_1 },
    });
    const patientId = created.json().id as string;
    const upload = await app.inject({
      method: "POST",
      url: `/patients/${patientId}/documents/upload`,
      headers,
      payload: {
        kind: "radiograph",
        fileName: "exam.png",
        contentType: "image/png",
        sizeBytes: 1024,
      },
    });
    expect(upload.statusCode).toBe(201);
    expect(upload.json().requiredHeaders["content-length"]).toBe("1024");

    const download = await app.inject({
      method: "GET",
      url: `/patients/${patientId}/documents/${upload.json().documentId}/download`,
      headers,
    });
    expect(download.statusCode).toBe(200);
    expect(download.json().downloadUrl).toContain("download.example.invalid");
  });
});
