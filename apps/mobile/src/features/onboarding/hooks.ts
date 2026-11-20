import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useSession } from '@/features/auth';
import { usePets } from '@/features/pets/hooks';
import { addPetGate, OnboardingFlags, type AddPetGate } from './gate';

const flags = new OnboardingFlags({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
});

/** userId → has finished the «Додайте улюбленця» screen. Missing = not read from the device yet. */
const useDone = create<Record<string, boolean>>(() => ({}));

/** Marks the screen as finished for the current user, in memory at once and on the device. */
export function completeAddPet(userId: string): void {
  useDone.setState({ [userId]: true });
  void flags.complete(userId);
}

/** Decides whether the signed-in user sees «Додайте улюбленця» or the tabs. */
export function useAddPetGate(options?: { settled?: boolean }): {
  gate: AddPetGate;
  userId: string | null;
} {
  const settled = options?.settled ?? false;
  const userId = useSession((s) => s.user?.id ?? null);
  const done = useDone((s) => (userId ? (s[userId] ?? null) : null));
  // A returning user does not wait for the pets list; neither does a screen that is already decided.
  const pets = usePets({ enabled: done === false && !settled });

  useEffect(() => {
    if (!userId || done !== null) return;
    let cancelled = false;
    void flags.isDone(userId).then((value) => {
      if (!cancelled) useDone.setState({ [userId]: value });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, done]);

  // A user who already has pets is past onboarding for good.
  const hasPets = (pets.data?.length ?? 0) > 0;
  useEffect(() => {
    if (userId && done === false && hasPets) completeAddPet(userId);
  }, [userId, done, hasPets]);

  return {
    userId,
    gate: addPetGate({
      done,
      pets: { status: pets.status, count: pets.data?.length ?? 0 },
      settled,
    }),
  };
}
