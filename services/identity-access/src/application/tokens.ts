/**
 * Emissao e verificacao de JWT (access token) e geracao/hash de refresh token.
 *
 * - Access token: JWT HS256 assinado com o segredo da config. Claims minimas
 *   (sub, tenantId, roles, units). Sem PII sensivel.
 * - Refresh token: valor aleatorio opaco. Persistimos apenas o hash SHA-256,
 *   nunca o valor em claro.
 */

import type { ClinicUnitId, Role, TenantId, UserId } from "@dentalprime/core";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AccessTokenClaims {
  readonly sub: UserId;
  readonly tenantId: TenantId;
  readonly roles: readonly Role[];
  readonly units: readonly ClinicUnitId[];
}

export interface TokenService {
  issueAccessToken(claims: AccessTokenClaims): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
  generateRefreshToken(): { token: string; hash: string };
  hashRefreshToken(token: string): string;
}

export class JoseTokenService implements TokenService {
  private readonly key: Uint8Array;

  constructor(
    jwtSecret: string,
    private readonly accessTtlSeconds: number,
    private readonly issuer = "dentalprime-identity-access",
  ) {
    this.key = new TextEncoder().encode(jwtSecret);
  }

  async issueAccessToken(claims: AccessTokenClaims): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      tenantId: claims.tenantId,
      roles: claims.roles,
      units: claims.units,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setIssuedAt(now)
      .setExpirationTime(now + this.accessTtlSeconds)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, this.key, { issuer: this.issuer });
    return toClaims(payload);
  }

  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}

function toClaims(payload: JWTPayload): AccessTokenClaims {
  const sub = payload.sub;
  const tenantId = payload["tenantId"];
  const roles = payload["roles"];
  const units = payload["units"];

  if (typeof sub !== "string" || typeof tenantId !== "string") {
    throw new Error("token invalido: claims obrigatorias ausentes");
  }
  return {
    sub,
    tenantId,
    roles: Array.isArray(roles) ? (roles as Role[]) : [],
    units: Array.isArray(units) ? (units as ClinicUnitId[]) : [],
  };
}
