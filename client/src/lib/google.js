import { api } from './api';

// Google's own button, drawn by Google's own script. Using their renderer instead of a
// hand-drawn look-alike keeps the mark and the wording inside their brand rules, and the
// popup that follows is theirs too.
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let script = null;
let clientId = null;

function loadScript() {
  if (script) return script;

  script = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();

    const tag = document.createElement('script');
    tag.src = SCRIPT_SRC;
    tag.async = true;
    tag.defer = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
    document.head.appendChild(tag);
  });

  return script;
}

// The public client id comes from the API, so the browser always uses the same one the
// server verifies tokens against. A client id is not a secret.
async function getClientId() {
  if (clientId !== null) return clientId;
  const { data } = await api.get('/auth/google/config');
  clientId = data?.clientId || '';
  return clientId;
}

// Returns false when the server has no Google client configured, which is the signal to
// leave the button off the page entirely.
export async function mountGoogleButton(element, onCredential) {
  if (!element) return false;

  const id = await getClientId();
  if (!id) return false;

  await loadScript();

  window.google.accounts.id.initialize({
    client_id: id,
    callback: ({ credential }) => credential && onCredential(credential),
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  // Google takes the button width in pixels, so it is measured against the card it sits in
  // and kept inside the range Google allows.
  const width = Math.min(400, Math.max(240, Math.round(element.clientWidth || 320)));

  window.google.accounts.id.renderButton(element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'rectangular',
    text: 'continue_with',
    logo_alignment: 'left',
    width,
  });

  return true;
}
