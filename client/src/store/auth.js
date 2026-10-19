import { create } from 'zustand';
import { api, bootstrapSession, setAccessToken, setSessionHandlers } from '../lib/api';

export const useAuth = create((set) => ({
  // loading -> the splash screen, so nobody ever sees a flash of the login page
  status: 'loading',
  user: null,

  setSession: (data) => {
    setAccessToken(data.accessToken);
    set({ user: data.user, status: 'ready' });
  },

  clear: () => {
    setAccessToken(null);
    set({ user: null, status: 'guest' });
  },

  async bootstrap() {
    try {
      const data = await bootstrapSession();
      setAccessToken(data.accessToken);
      set({ user: data.user, status: 'ready' });
    } catch {
      setAccessToken(null);
      set({ user: null, status: 'guest' });
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // even if the call fails the local session is cleared below
    }
    setAccessToken(null);
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
  refreshed: (data) => useAuth.setState({ user: data.user, status: 'ready' }),
  lost: () => useAuth.setState({ user: null, status: 'guest' }),
});

export const hasRole = (user, roles) => !!user && (roles.length === 0 || roles.includes(user.role));
