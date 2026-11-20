import type { ApiPet, InviteOptions } from '@pet-app/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../../shared/api/http';
import { petKeys } from '../pets/queries';
import type { FamilyApi } from './api';
import {
  initialSelection,
  inviteErrorKey,
  inviteLink,
  parseInviteToken,
  toggleSelection,
} from './invite';
import { acceptInviteMutation, familyKeys, removeMemberMutation } from './queries';

const token = 'AbC_dEf-0123456789AbC_dEf-0123456789abcdefg';

const pet = (id: string, name: string, hasRoom: boolean): InviteOptions['pets'][number] => ({
  id,
  name,
  species: 'cat',
  memberCount: hasRoom ? 1 : 2,
  hasRoom,
});
const buddy = pet('11111111-1111-4111-8111-111111111111', 'Бадді', true);
const mango = pet('22222222-2222-4222-8222-222222222222', 'Манго', false);
const dym = pet('33333333-3333-4333-8333-333333333333', 'Дим', true);

describe('invite link', () => {
  it('is an https link on the API host — messengers make only those tappable', () => {
    expect(inviteLink('https://api.example.test/', token)).toBe(
      `https://api.example.test/invite/${token}`,
    );
  });

  it('is read back from whatever the person pasted', () => {
    expect(parseInviteToken(`https://api.example.test/invite/${token}`)).toBe(token);
    expect(parseInviteToken(`  petapp://invite/${token}\n`)).toBe(token);
    expect(parseInviteToken(`https://api.example.test/invite/${token}/?utm=1`)).toBe(token);
    expect(parseInviteToken(token)).toBe(token);
  });

  it('rejects text that is not an invite', () => {
    for (const value of ['', 'привіт', 'https://example.test/', 'short', `${token} зайве`]) {
      expect(parseInviteToken(value), value).toBeNull();
    }
  });
});

describe('choosing pets for an invite', () => {
  const pets = [buddy, mango, dym];

  it('ticks the pet the screen was opened from', () => {
    expect(initialSelection(pets, dym.id)).toEqual([dym.id]);
  });

  it('ticks every pet with room when opened from the home — one invite for all pets', () => {
    expect(initialSelection(pets)).toEqual([buddy.id, dym.id]);
  });

  it('never ticks a pet that has no room, even when the screen was opened from it', () => {
    expect(initialSelection(pets, mango.id)).toEqual([]);
    expect(toggleSelection([buddy.id], mango)).toEqual([buddy.id]);
  });

  it('ticks and unticks a pet with room', () => {
    expect(toggleSelection([buddy.id], dym)).toEqual([buddy.id, dym.id]);
    expect(toggleSelection([buddy.id, dym.id], buddy)).toEqual([dym.id]);
  });
});

describe('invite errors in words', () => {
  it('maps every API answer to a message', () => {
    const cases: [unknown, string][] = [
      [new ApiError(410, 'invite_expired'), 'family.errors.expired'],
      [new ApiError(409, 'invite_used'), 'family.errors.used'],
      [new ApiError(410, 'invite_revoked'), 'family.errors.revoked'],
      [new ApiError(404, 'invite_not_found'), 'family.errors.notFound'],
      [new ApiError(409, 'member_limit'), 'family.errors.limit'],
      [new ApiError(409, 'own_invite'), 'family.errors.own'],
      [new ApiError(403, 'forbidden'), 'family.errors.forbidden'],
      [new NetworkError(), 'family.errors.network'],
      [new ApiError(500, 'internal'), 'family.errors.unknown'],
    ];
    for (const [error, key] of cases) expect(inviteErrorKey(error)).toBe(key);
  });
});

describe('family cache', () => {
  const api = {
    accept: () => Promise.resolve({ petIds: [buddy.id] }),
    removeMember: () => Promise.resolve(),
  } as unknown as FamilyApi;

  const run = <TData, TVars>(
    client: QueryClient,
    options: { mutationFn: (vars: TVars) => Promise<TData>; onSuccess: () => Promise<unknown> },
    vars: TVars,
  ) => client.getMutationCache().build(client, options).execute(vars);

  it('reloads the pets list after an invite is accepted, so the new pets appear', async () => {
    const client = new QueryClient();
    client.setQueryData<ApiPet[]>(petKeys.list(), []);
    await run(client, acceptInviteMutation(api, client), token);
    expect(client.getQueryState(petKeys.list())?.isInvalidated).toBe(true);
  });

  it('reloads the members and the free places after a member is removed', async () => {
    const client = new QueryClient();
    client.setQueryData(familyKeys.members(buddy.id), { memberLimit: 2, members: [] });
    client.setQueryData(familyKeys.options(), { memberLimit: 2, pets: [] });
    await run(client, removeMemberMutation(api, client, buddy.id), 'user-id');
    expect(client.getQueryState(familyKeys.members(buddy.id))?.isInvalidated).toBe(true);
    expect(client.getQueryState(familyKeys.options())?.isInvalidated).toBe(true);
  });
});
