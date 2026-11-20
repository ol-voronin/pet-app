import type { InviteOptions } from '@pet-app/shared';

/** Link sent to the invited person. It opens a page on the API host that hands over to the app. */
export function inviteLink(apiUrl: string, token: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/invite/${token}`;
}

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/**
 * Takes what a person pasted — the https link, the `petapp://` link or the bare code —
 * and returns the invite token, or null when it is none of those.
 */
export function parseInviteToken(input: string): string | null {
  const value = input.trim();
  const fromLink = /\/invite\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(value)?.[1];
  const token = fromLink ?? value;
  return TOKEN.test(token) ? token : null;
}

export type InviteErrorKey =
  | 'family.errors.expired'
  | 'family.errors.used'
  | 'family.errors.revoked'
  | 'family.errors.notFound'
  | 'family.errors.limit'
  | 'family.errors.own'
  | 'family.errors.forbidden'
  | 'family.errors.network'
  | 'family.errors.unknown';

const byCode: Record<string, InviteErrorKey> = {
  invite_expired: 'family.errors.expired',
  invite_used: 'family.errors.used',
  invite_revoked: 'family.errors.revoked',
  invite_not_found: 'family.errors.notFound',
  pet_not_found: 'family.errors.notFound',
  member_limit: 'family.errors.limit',
  own_invite: 'family.errors.own',
  forbidden: 'family.errors.forbidden',
  owner_cannot_be_removed: 'family.errors.forbidden',
};

/** i18n key of the message for a failed family request. Takes plain shapes so this file stays UI-free. */
export function inviteErrorKey(error: unknown): InviteErrorKey {
  if (error instanceof Error && error.message === 'network_error') return 'family.errors.network';
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const key = byCode[String(error.code)];
    if (key) return key;
  }
  return 'family.errors.unknown';
}

type OptionPet = InviteOptions['pets'][number];

/**
 * Which pets are ticked when the invite screen opens: the pet it was opened from, or every pet
 * with room when opened from the home. A pet without room can never be ticked.
 */
export function initialSelection(pets: OptionPet[], fromPetId?: string): string[] {
  const withRoom = pets.filter((p) => p.hasRoom);
  if (fromPetId) return withRoom.filter((p) => p.id === fromPetId).map((p) => p.id);
  return withRoom.map((p) => p.id);
}

/** Ticks or unticks a pet; a pet without room stays unticked. */
export function toggleSelection(selected: string[], pet: OptionPet): string[] {
  if (!pet.hasRoom) return selected;
  return selected.includes(pet.id) ? selected.filter((id) => id !== pet.id) : [...selected, pet.id];
}
