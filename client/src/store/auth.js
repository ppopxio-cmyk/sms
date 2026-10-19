import { create } from 'zustand';
import {
  api,
  bootstrapSessionIfSignedIn,
  markSessionHint,
  clearSessionHint,
  setAccessToken,
  setSessionHandlers,
} from '../lib/api';
import { clearFlows } from '../lib/session-flow';

export const useAuth = create((set) => ({
  // loading -> the splash screen, so nobody ever sees a flash of the login page
  status: 'loading',
  user: null,

  setSession: (data) => {
    setAccessToken(data.accessToken);
    markSessionHint();
    set({ user: data.user, status: 'ready' });
  },

  clear: () => {
    setAccessToken(null);
    clearSessionHint();
    set({ user: null, status: 'guest' });
  },

  async bootstrap() {
    try {
      const data = await bootstrapSessionIfSignedIn();
      if (!data) {
        setAccessToken(null);
        set({ user: null, status: 'guest' });
        return;
      }
      setAccessToken(data.accessToken);
      set({ user: data.user, status: 'ready' });
    } catch {
      setAccessToken(null);
      clearSessionHint();
      set({ user: null, status: 'guest' });
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // even if the call fails the local session is cleared below
    }
    clearFlows();
    setAccessToken(null);
    clearSessionHint();
    set({ user: null, status: 'guest' });
  },

  async refreshUser() {
    const { data } = await api.get('/auth/me');
    set({ user: data.user });
    return data.user;
  },
}));

// When a silent token refresh succeeds, keep the store in step.
setSessionHandlers({
  refreshed: (data) => {
    markSessionHint();
    useAuth.setState({ user: data.user, status: 'ready' });
  },
  lost: () => {
    clearSessionHint();
    useAuth.setState({ user: null, status: 'guest' });
  },
});

export const hasRole = (user, roles) => !!user && (roles.length === 0 || roles.includes(user.role));
