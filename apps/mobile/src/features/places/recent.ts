import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { addRecentSearch, parseRecentSearches } from './logic';

const KEY = 'petapp.places.recent';

interface RecentState {
  /** `null` — not read from the device yet. */
  recent: string[] | null;
  load: () => Promise<void>;
  add: (query: string) => void;
  clear: () => void;
}

/**
 * Recent map searches, kept on the device only. They are what the search shows without network.
 * Stored next to the session because the project has one small on-device store; nothing here is secret.
 */
export const useRecentSearches = create<RecentState>((set, get) => ({
  recent: null,
  load: async () => {
    if (get().recent !== null) return;
    let stored: string | null = null;
    try {
      stored = await SecureStore.getItemAsync(KEY);
    } catch {
      // Unreadable storage is the same as an empty history.
    }
    set((state) => (state.recent === null ? { recent: parseRecentSearches(stored) } : state));
  },
  add: (query) => {
    const recent = addRecentSearch(get().recent ?? [], query);
    set({ recent });
    void SecureStore.setItemAsync(KEY, JSON.stringify(recent)).catch(() => undefined);
  },
  clear: () => {
    set({ recent: [] });
    void SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  },
}));
