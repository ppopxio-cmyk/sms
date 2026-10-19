// Chrome freezes the version numbers inside the user agent string on purpose: it reports
// "Windows 10" on Windows 11, and "Android 10" on every Android since. The browser will
// still answer honestly when asked directly, through the Client Hints API, so it is asked
// once and the answer rides along with every request in a small header.
//
// It is a label on a security screen and in an alert email. It is never proof of who
// somebody is, and nothing is decided from it. Browsers that do not offer the API send
// nothing, and the server falls back to reading the user agent string.

const HEADER = 'X-Device-Info';
const REFRESH_MS = 12 * 60 * 60 * 1000;

const KNOWN_BROWSERS = [
  'Google Chrome',
  'Microsoft Edge',
  'Samsung Internet',
  'Brave',
  'Opera',
  'Vivaldi',
  'Chromium',
];

const base64url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function collect() {
  const data = navigator.userAgentData;
  if (!data?.getHighEntropyValues) return null;

  const hints = await data.getHighEntropyValues([
    'platform',
    'platformVersion',
    'model',
    'architecture',
    'bitness',
    'fullVersionList',
  ]);

  // The list starts with made-up "GREASE" brands. The real one is whichever of the
  // names below is present; failing that, the last entry is the honest one.
  const list = Array.isArray(hints.fullVersionList) ? hints.fullVersionList : [];
  const real = list.find((entry) => KNOWN_BROWSERS.some((name) => entry.brand?.includes(name))) ?? list[list.length - 1];

  return {
    platform: hints.platform,
    platformVersion: hints.platformVersion,
    model: hints.model,
    architecture: hints.architecture,
    bitness: hints.bitness,
    mobile: data.mobile === true,
    browser: real?.brand,
    browserVersion: real?.version,
  };
}

// Called once, from the module that builds the API client. Until the browser answers,
// requests simply go without the header; after that every request carries it.
export function primeDeviceInfo(instance) {
  const run = () => {
    collect()
      .then((payload) => {
        if (!payload) return;
        instance.defaults.headers.common[HEADER] = base64url(JSON.stringify(payload));
      })
      .catch(() => {
        // An older browser, or a page without permission: the user agent string still works.
      });
  };

  run();
  // A tab can stay open for days. Asking again now and then keeps a long session from
  // reporting a version the browser has already left behind.
  setInterval(run, REFRESH_MS);
}
