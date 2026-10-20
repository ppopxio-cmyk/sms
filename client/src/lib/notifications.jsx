import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import { showLocalNotification } from './push';
import NoticeToast from '../components/layout/NoticeToast';

const LIST_KEY = 'notifications';

export function useUnread() {
  return useQuery({
    queryKey: [LIST_KEY, 'unread'],
    queryFn: async () => (await api.get('/notifications/unread')).data,
    // A safety net: if the live stream cannot be opened at all, the count is still
    // never more than a minute out of date.
    refetchInterval: 60_000,
  });
}

export function useNotifications({ unread = false, limit = 30 } = {}) {
  return useQuery({
    queryKey: [LIST_KEY, 'list', { unread, limit }],
    queryFn: async () => (await api.get('/notifications', { params: { unread: unread ? '1' : '0', limit } })).data,
    // The live stream updates this immediately. This slower fallback keeps the page
    // fresh when a browser blocks the stream or the server restarts.
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}

// One live connection while somebody is signed in. A notice that arrives on it floats in
// at the top corner straight away and refreshes the list, so no page refresh is needed;
// if the connection drops, it reconnects, and the periodic refetch above covers the gap.
export function useNotificationStream(enabled) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let source = null;
    let timer = null;
    let stopped = false;

    const connect = async () => {
      try {
        const { data } = await api.post('/notifications/stream-ticket');
        if (stopped) return;

        source = new EventSource(`/api/notifications/stream?ticket=${encodeURIComponent(data.ticket)}`);
        source.onopen = () => setConnected(true);
        source.addEventListener('notification', (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch {
            // not JSON: the list refresh below is enough
          }
          queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
          if (payload) {
            // One card per notice, keyed by its id, so a reconnect cannot show it twice.
            toast.custom((id) => <NoticeToast id={id} notice={payload} />, {
              id: `notice-${payload.id}`,
              duration: 9000,
            });
            void showLocalNotification({
              title: payload.title,
              body: payload.body,
              url: '/notifications',
              tag: `sms-${payload.id}`,
            });
          }
        });
        source.onerror = () => {
          setConnected(false);
          source?.close();
          source = null;
          if (!stopped) timer = setTimeout(connect, 6000);
        };
      } catch {
        setConnected(false);
        if (!stopped) timer = setTimeout(connect, 15_000);
      }
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [enabled, queryClient]);

  return connected;
}
