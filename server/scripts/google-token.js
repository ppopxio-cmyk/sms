// One-time helper that prints the refresh token the Gmail API needs.
//
//   npm run google:token
//
// It listens on the port that is registered as the redirect URI
// (http://localhost:5000/oauth2callback), so the API dev server must be stopped while it
// runs. The token it prints goes into server/.env and into Render's environment.
import 'dotenv/config';
import http from 'node:http';
import { exec } from 'node:child_process';

const PORT = 5000;
const CALLBACK = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('\nAdd GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env first.\n');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: CALLBACK,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent', // without this Google hands back no refresh token on a repeat visit
}).toString();

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto">
<h1 style="font-size:20px">${title}</h1><p style="color:#475569">${body}</p></body>`;

async function exchange(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: CALLBACK,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  return data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, CALLBACK);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }

  const refused = url.searchParams.get('error');
  if (refused) {
    res.writeHead(400, { 'content-type': 'text/html' }).end(page('Google refused the request', refused));
    console.error(`\nGoogle refused the request: ${refused}\n`);
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const data = await exchange(url.searchParams.get('code'));
    res.writeHead(200, { 'content-type': 'text/html' }).end(page('Done', 'You can close this tab and go back to the terminal.'));
    console.log('\nGOOGLE_REFRESH_TOKEN=' + data.refresh_token);
    console.log('\nCopy that line into server/.env and add the same three GOOGLE_ variables to Render.\n');
    server.close();
    process.exitCode = 0;
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/html' }).end(page('That did not work', err.message));
    console.error('\nCould not exchange the code:', err.message, '\n');
    server.close();
    process.exitCode = 1;
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is busy. Stop the API dev server (the one on port ${PORT}) and run this again.\n`);
  } else {
    console.error('\n' + err.message + '\n');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('\nOpen this address, sign in as the school Gmail account, and press Allow:\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for the redirect...\n');
  if (process.platform === 'win32') exec(`start "" "${authUrl}"`);
});
