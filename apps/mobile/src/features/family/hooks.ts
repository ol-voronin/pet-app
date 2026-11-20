import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { familyApi } from './client';
import {
  acceptInviteMutation,
  createInviteMutation,
  inviteOptionsQuery,
  invitePreviewQuery,
  petMembersQuery,
  removeMemberMutation,
} from './queries';

// Thin wrappers: what each hook fetches and how it updates the cache is defined (and tested) in queries.ts.

export const useInviteOptions = () => useQuery(inviteOptionsQuery(familyApi));

export const useInvitePreview = (token: string) => useQuery(invitePreviewQuery(familyApi, token));

export const usePetMembers = (petId: string) => useQuery(petMembersQuery(familyApi, petId));

export const useCreateInvite = () => useMutation(createInviteMutation(familyApi));

export const useAcceptInvite = () => useMutation(acceptInviteMutation(familyApi, useQueryClient()));

export const useRemoveMember = (petId: string) =>
  useMutation(removeMemberMutation(familyApi, useQueryClient(), petId));

/**
 * An invite link opened before sign-in. It waits here (in memory) until the person has
 * signed in, then the app opens the invite instead of the tabs.
 */
export const usePendingInvite = create<{ token: string | null }>(() => ({ token: null }));
