import * as SecureStore from 'expo-secure-store';
import type { SessionStorage, StoredSession } from './session';

const KEY = 'petapp.session';

/** Keychain (iOS) / Keystore-encrypted storage (Android). The refresh token never touches plain storage. */
export const secureSessionStorage: SessionStorage = {
  async load() {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      await SecureStore.deleteItemAsync(KEY);
      return null;
    }
  },
  save: (session) => SecureStore.setItemAsync(KEY, JSON.stringify(session)),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
