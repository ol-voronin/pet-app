import { api } from '@/features/auth/client';
import { unwrap, unwrapEmpty } from '@/shared/api/http';
import type { FamilyApi } from './api';

/** FamilyApi over the real HTTP client. */
export const familyApi: FamilyApi = {
  options: () => unwrap(api.GET('/invites/options')),
  createInvite: (body) => unwrap(api.POST('/invites', { body })),
  preview: (token) => unwrap(api.POST('/invites/preview', { body: { token } })),
  accept: (token) => unwrap(api.POST('/invites/accept', { body: { token } })),
  members: (petId) => unwrap(api.GET('/pets/{petId}/members', { params: { path: { petId } } })),
  removeMember: (petId, userId) =>
    unwrapEmpty(
      api.DELETE('/pets/{petId}/members/{userId}', { params: { path: { petId, userId } } }),
    ),
};
