import { create } from 'zustand';
import { authApi } from './api';
import { SessionManager, type SessionState } from './session';
import { secureSessionStorage } from './storage';

/** Who is signed in. Screens read it; only the session manager writes it. */
export const useSession = create<SessionState>(() => ({ status: 'loading', user: null }));

export const session = new SessionManager({
  api: authApi,
  storage: secureSessionStorage,
  onChange: (state) => {
    useSession.setState(state, true);
  },
});
