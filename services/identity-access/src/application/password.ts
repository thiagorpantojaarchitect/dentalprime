/**
 * Hash e verificacao de senha com argon2id.
 *
 * A senha em claro nunca e persistida nem logada. Guardamos apenas o hash.
 */

import argon2 from "argon2";

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export const argon2Hasher: PasswordHasher = {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  },
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash malformado ou erro de verificacao: trata como nao correspondente.
      return false;
    }
  },
};
