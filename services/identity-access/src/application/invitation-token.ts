import { createHash, randomBytes } from "node:crypto";

export interface InvitationTokenService {
  generate(): string;
  hash(token: string): string;
}

export const secureInvitationTokens: InvitationTokenService = {
  generate(): string {
    return randomBytes(32).toString("base64url");
  },
  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  },
};
