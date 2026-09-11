/**
 * StorageAdapter do app do profissional usando Expo SecureStore (keychain/
 * keystore do dispositivo). Implementa o contrato assincrono do SessionStore.
 */

import * as SecureStore from "expo-secure-store";
import type { StorageAdapter } from "@dentalprime/mobile-core";

export const secureStorage: StorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
