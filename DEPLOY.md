# Deploying the School Management System

Two hosts, one origin. The browser only ever talks to the Vercel domain; Vercel proxies
`/api/*` to Render. That keeps the refresh cookie first-party (`SameSite=Strict`), which
is what stops a page refresh from signing people out.

```
Browser ──▶ Vercel (React build + /api proxy) ──▶ Render (Express API) ──▶ MongoDB Atlas
                                                     │
                                                     └──▶ Gmail API over HTTPS (port 443)
```

| Piece | Where | Notes |
|---|---|---|
| Client | Vercel, root directory `client` | Vite build → `dist`; `client/vercel.json` holds the proxy and the SPA fallback |
| API | Render, root directory `server` | `npm ci` then `npm start`; health check `/api/health` |
| Database | MongoDB Atlas | Reuse the development cluster so accounts carry over |
| Email | Gmail API (HTTPS) | `gmail.send` scope; the SMTP app password cannot work on Render Free |

---

## 1. Render (API)

Create the service: **New → Web Service → this repository**.

| Field | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance Type | Free (see the cold-start note below) |

Do **not** set `PORT` — Render injects it and the app reads it.

### Environment

Paste this list into **Environment** (Render has an *Add from .env* button that takes
`KEY=VALUE` lines). `render.yaml` in the repository root documents the same settings.

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.21.0` |
| `TRUST_PROXY` | `1` |
| `CLIENT_ORIGIN` | `https://sms-two-kappa.vercel.app` |
| `MONGODB_URI` | Atlas connection string |
| `SMTP_USER` | `haile12michaell@gmail.com` (also the address mail is sent from) |
| `MAIL_FROM_NAME` | `School Management System` |
| `GOOGLE_CLIENT_ID` | from Google Cloud → Credentials |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud → Credentials |
| `GOOGLE_REFRESH_TOKEN` | from `npm run google:token` |
| `JWT_ACCESS_SECRET` | random, 48 bytes |
| `CODE_HMAC_SECRET` | random, 48 bytes |
| `VAPID_PUBLIC_KEY` | Web Push key pair |
| `VAPID_PRIVATE_KEY` | Web Push key pair |
| `VAPID_SUBJECT` | `mailto:haile12michaell@gmail.com` |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The server refuses to start if it cannot send email at all, so either the three `GOOGLE_*`
values or `SMTP_APP_PASSWORD` must be present.

## 2. Vercel (client)

Import the repository, set **Root Directory** to `client`, framework **Vite**, build
`npm run build`, output `dist`, install `npm ci`, and add `VITE_API_URL=/api` for all
three environments. `client/vercel.json` does the rest:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://sms-api-62y1.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Changing the API host means editing that file and pushing once.

## 3. Google Cloud

**Credentials → OAuth client (Web application), authorised redirect URIs:**

```
http://localhost:5000/oauth2callback     (helper default)
http://localhost:53682/oauth2callback    (helper on another port)
```

**Audience:** add the school's Gmail address as a test user while the app is in *Testing*.

**Branding:** app name `School Management System`, support email and developer contact
`haile12michaell@gmail.com`, homepage `https://sms-two-kappa.vercel.app`, privacy
`…/privacy`, terms `…/terms`, authorised domain `sms-two-kappa.vercel.app`.

The homepage must state the same name — the sign-in screen shows *School Management
System* as its heading and the document title is the same, which is what the review checks.

**Domain ownership** (Search Console) is satisfied either way:

- `/google764c579ec18f4bbf.html` — served from `client/public`.
- `<meta name="google-site-verification" …>` in `client/index.html`.

## 4. Email through the Gmail API

```bash
cd server
npm run google:token -- --port=53682   # browser opens, sign in, press Allow
npm run test:mail                      # sends a real message and reports the transport
```

While the OAuth app is in **Testing**, Google expires refresh tokens after **7 days**, so
re-run the helper weekly. Publishing the app removes that, but Google may require
verification for the `gmail.send` scope first.

## 5. After a deploy, check these

1. `https://sms-api-62y1.onrender.com/api/health` → `{"ok":true}`.
2. Sign in as the administrator → `/admin`.
3. Hard-refresh on `/admin/users` → loads, not a 404 (SPA fallback).
4. DevTools → Application → Cookies: `rt` (HttpOnly, Secure, SameSite=Strict) and `did`.
5. DevTools → Application → Service Workers: `sw.js` activated.
6. DevTools → Network: `api/notifications/stream?ticket=…` stays pending.
7. Forgot-password → the code email arrives → the reset completes.
8. Render logs contain no `email could not be sent`.

## 6. Known limits

- **Render Free sleeps after 15 idle minutes.** The next request takes 30–60 s, and the
  live-notification stream reconnects on its own. A paid instance removes the wait.
- **Render Free blocks SMTP ports** 25, 465 and 587 — hence the Gmail API.
- **Rate limits are per IP** (login: 20 per 15 minutes). If everybody arrives through the
  Vercel proxy and the audit trail shows the wrong address, set `TRUST_PROXY=2`.
- **Preview deployments** are a different origin and are refused by the CSRF check; add
  the preview domain to `CLIENT_ORIGINS`, or test on production.
- **Gmail** allows roughly 500 recipients a day on a personal account.
