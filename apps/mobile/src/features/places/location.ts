import * as Location from 'expo-location';
import { create } from 'zustand';
import type { Point } from './api';

export type LocationStatus = 'unknown' | 'asking' | 'granted' | 'denied' | 'unavailable';

interface LocationState {
  status: LocationStatus;
  /** Where the person is; `null` until they share it. */
  point: Point | null;
  /** Asks for permission (only when the person taps "near me") and reads the position once. */
  locate: () => Promise<void>;
}

/**
 * The person's own position, foreground only and only on request: it sorts places by distance.
 * It is sent to our API as a search centre and stored nowhere.
 */
export const useUserLocation = create<LocationState>((set, get) => ({
  status: 'unknown',
  point: null,
  locate: async () => {
    if (get().status === 'asking') return;
    set({ status: 'asking' });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        set({ status: 'denied' });
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      set({
        status: 'granted',
        point: { lat: position.coords.latitude, lon: position.coords.longitude },
      });
    } catch {
      // GPS off, no fix indoors, emulator without a location.
      set({ status: 'unavailable' });
    }
  },
}));
