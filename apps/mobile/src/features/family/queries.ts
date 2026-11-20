import type { CreateInviteBody } from '@pet-app/shared';
import type { QueryClient } from '@tanstack/react-query';
import { petKeys } from '../pets/queries';
import type { FamilyApi } from './api';

export const familyKeys = {
  all: ['family'] as const,
  options: () => [...familyKeys.all, 'options'] as const,
  preview: (token: string) => [...familyKeys.all, 'preview', token] as const,
  members: (petId: string) => [...familyKeys.all, 'members', petId] as const,
};

export const inviteOptionsQuery = (api: FamilyApi) => ({
  queryKey: familyKeys.options(),
  queryFn: () => api.options(),
  // Room under the limit changes when someone accepts: always ask before showing the screen.
  staleTime: 0,
});

export const invitePreviewQuery = (api: FamilyApi, token: string) => ({
  queryKey: familyKeys.preview(token),
  queryFn: () => api.preview(token),
  // An expired or used link will not become valid by asking again.
  retry: false,
});

export const petMembersQuery = (api: FamilyApi, petId: string) => ({
  queryKey: familyKeys.members(petId),
  queryFn: () => api.members(petId),
});

export const createInviteMutation = (api: FamilyApi) => ({
  mutationFn: (body: CreateInviteBody) => api.createInvite(body),
});

/** After accepting, the new pets must appear: the pets list is reloaded. */
export const acceptInviteMutation = (api: FamilyApi, client: QueryClient) => ({
  mutationFn: (token: string) => api.accept(token),
  onSuccess: () => client.invalidateQueries({ queryKey: petKeys.all }),
});

/** After a member is removed, the member list and the free places are reloaded. */
export const removeMemberMutation = (api: FamilyApi, client: QueryClient, petId: string) => ({
  mutationFn: (userId: string) => api.removeMember(petId, userId),
  onSuccess: () =>
    Promise.all([
      client.invalidateQueries({ queryKey: familyKeys.members(petId) }),
      client.invalidateQueries({ queryKey: familyKeys.options() }),
    ]),
});
