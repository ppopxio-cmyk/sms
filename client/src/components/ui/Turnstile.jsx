import { useEffect, useRef } from 'react';

// The site key is public by design: it only tells Cloudflare which widget to draw. It is
// kept as a fallback so a missing build-time variable cannot leave the sign-in page without
// a check while the server requires one.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFcg5Rv9MAzE-SwF';
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const turnstileEnabled = Boolean(SITE_KEY);

let loading = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('The human check could not be loaded.'));
      document.head.appendChild(script);
    });
  }
  return loading;
}

// A small, self-contained widget. The token it produces is single use, so a failed sign-in
// must give it a fresh key; the parent does that by re-mounting it.
export default function Turnstile({ onToken, theme = 'light', className = '' }) {
  const host = useRef(null);
  const widget = useRef(null);
  const callback = useRef(onToken);

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let gone = false;

    loadScript()
      .then(() => {
        if (gone || !host.current || !window.turnstile) return;
        widget.current = window.turnstile.render(host.current, {
          sitekey: SITE_KEY,
          theme,
          retry: 'auto',
          callback: (token) => callback.current?.(token),
          'expired-callback': () => callback.current?.(''),
          'timeout-callback': () => callback.current?.(''),
          'error-callback': () => callback.current?.(''),
        });
      })
      .catch(() => callback.current?.(''));

    return () => {
      gone = true;
      try {
        if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      } catch {
        // the widget is already gone
      }
      widget.current = null;
    };
  }, [theme]);

  if (!SITE_KEY) return null;
  return <div ref={host} className={className} />;
}
