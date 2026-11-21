import { unwrapEmpty } from '@/shared/api/http';
import { queryClient } from '@/shared/api/queryClient';
import { api } from './client';
import { session } from './store';

/** Deletes the current account after OTP confirmation, then clears cached data and local session. */
export async function deleteAccount(input: { challengeId: string; code: string }): Promise<void> {
  await unwrapEmpty(api.DELETE('/me', { body: input }));
  queryClient.clear();
  await session.handleUnauthorized();
}
