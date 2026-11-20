import { describe, expect, it } from 'vitest';
import { addPetGate, OnboardingFlags, type FlagStorage } from './gate';

const loaded = (count: number) => ({ status: 'success' as const, count });

describe('addPetGate — «Додайте улюбленця» after the first sign-in', () => {
  it('shows the screen to a new user with no pets', () => {
    expect(addPetGate({ done: false, pets: loaded(0) })).toBe('show');
  });

  it('goes straight to the tabs for a user who already has pets', () => {
    expect(addPetGate({ done: false, pets: loaded(3) })).toBe('skip');
  });

  it('never shows the screen again after «Пізніше», even with no pets', () => {
    expect(addPetGate({ done: true, pets: loaded(0) })).toBe('skip');
    // The pets list is not even needed: a returning user does not wait for the network.
    expect(addPetGate({ done: true, pets: { status: 'pending', count: 0 } })).toBe('skip');
  });

  it('waits instead of flashing the map while the answer is unknown', () => {
    expect(addPetGate({ done: null, pets: loaded(0) })).toBe('wait');
    expect(addPetGate({ done: false, pets: { status: 'pending', count: 0 } })).toBe('wait');
  });

  it('does not block the app when the pets list cannot be loaded (offline)', () => {
    expect(addPetGate({ done: false, pets: { status: 'error', count: 0 } })).toBe('skip');
  });
});

describe('OnboardingFlags', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';

  function memory(): FlagStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      get: (key) => Promise.resolve(data.get(key) ?? null),
      set: (key, value) => {
        data.set(key, value);
        return Promise.resolve();
      },
    };
  }

  it('is not done for a new user and done after completion', async () => {
    const flags = new OnboardingFlags(memory());
    expect(await flags.isDone(userA)).toBe(false);
    await flags.complete(userA);
    expect(await flags.isDone(userA)).toBe(true);
  });

  it('keeps the flag per user: another person on the same phone still sees the screen', async () => {
    const flags = new OnboardingFlags(memory());
    await flags.complete(userA);
    expect(await flags.isDone(userB)).toBe(false);
  });

  it('uses a key the device storage accepts (letters, digits, dot, dash, underscore)', async () => {
    const storage = memory();
    await new OnboardingFlags(storage).complete(userA);
    expect([...storage.data.keys()]).toEqual([`petapp.onboarding.${userA}`]);
    expect([...storage.data.keys()][0]).toMatch(/^[\w.-]+$/);
  });

  it('skips the screen rather than repeating it when storage cannot be read', async () => {
    const broken: FlagStorage = {
      get: () => Promise.reject(new Error('keystore unavailable')),
      set: () => Promise.reject(new Error('keystore unavailable')),
    };
    const flags = new OnboardingFlags(broken);
    expect(await flags.isDone(userA)).toBe(true);
    await expect(flags.complete(userA)).resolves.toBeUndefined();
  });
});
