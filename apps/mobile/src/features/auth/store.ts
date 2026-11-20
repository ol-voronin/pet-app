import { create } from 'zustand';
import { queryClient } from '@/shared/api/queryClient';
import { authApi } from './api';
import { SessionManager, type SessionState } from './session';
import { secureSessionStorage } from './storage';

/** Who is signed in. Screens read it; only the session manager writes it. */
export const useSession = create<SessionState>(() => ({ status: 'loading', user: null }));

export const session = new SessionManager({
  api: authApi,
  storage: secureSessionStorage,
  onChange: (state) => {
    // Another person may sign in next on this phone: forget everything the API returned.
    if (state.status === 'signedOut') queryClient.clear();
    useSession.setState(state, true);
  },
});
