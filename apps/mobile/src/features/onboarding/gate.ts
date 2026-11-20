/**
 * Should the app open «Додайте улюбленця» instead of the tabs?
 * - `wait`: not known yet — keep the loading indicator, do not flash the map.
 * - `show`: first sign-in with no pets.
 * - `skip`: go to the tabs.
 */
export type AddPetGate = 'wait' | 'show' | 'skip';

export interface AddPetGateInput {
  /** Has this user already been through the screen? `null` while the flag is being read. */
  done: boolean | null;
  pets: { status: 'pending' | 'error' | 'success'; count: number };
}

export function addPetGate({ done, pets }: AddPetGateInput): AddPetGate {
  if (done === null) return 'wait';
  // Shown once: «Пізніше» or a first pet ends it for good, even if all pets are deleted later.
  if (done) return 'skip';
  if (pets.status === 'pending') return 'wait';
  // No answer from the server (offline): never hold the app on a loading screen.
  if (pets.status === 'error') return 'skip';
  return pets.count === 0 ? 'show' : 'skip';
}

/** Small key-value storage on the device (SecureStore on the phone, in-memory in tests). */
export interface FlagStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const key = (userId: string) => `petapp.onboarding.${userId}`;

/** Remembers, per user, that the «Додайте улюбленця» screen is finished. */
export class OnboardingFlags {
  constructor(private readonly storage: FlagStorage) {}

  async isDone(userId: string): Promise<boolean> {
    try {
      return (await this.storage.get(key(userId))) === 'done';
    } catch {
      // Unreadable storage: better to skip the screen than to show it on every launch.
      return true;
    }
  }

  async complete(userId: string): Promise<void> {
    try {
      await this.storage.set(key(userId), 'done');
    } catch {
      // The flag is a convenience; failing to save it must not break the app.
    }
  }
}
