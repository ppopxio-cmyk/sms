# Complete MERN SMS System Security, Speed and Analytics Checklist

Sections 1 to 12 are the original checklist. Sections 13 to 17 are new: analytics dashboard, speed, injection/XSS/CSRF protection, web push with VAPID keys, and the full npm install guide. Mandatory Development Rule 4 is updated to match.

## 1. Secrets and Environment Variables
- [ ] Keep API keys, JWT secrets, SMTP credentials, and MongoDB URIs in backend `.env` files.
- [ ] Never expose backend secrets through React environment variables or client-side bundles.
- [ ] Check Git history for accidentally committed secrets and rotate any exposed credentials.
- [ ] Ensure `.env`, backups, logs, and private configuration files are excluded from Git and inaccessible over HTTP.
- [ ] Validate required environment variables when the backend starts.
- [ ] Remove unused packages and scan dependencies for vulnerabilities.
- [ ] Disable debug mode and stack traces in production.

## 2. Authentication and Password Security
- [ ] Hash passwords securely using Argon2id or appropriately configured bcrypt.
- [ ] Implement secure registration, login, logout, and email verification.
- [ ] Implement forgot-password verification using a six-digit code that expires after five minutes.
- [ ] Limit password-reset and verification-code attempts.
- [ ] Enforce authentication on every protected backend endpoint.
- [ ] Use short-lived access credentials and revocable, server-tracked refresh sessions.
- [ ] Secure authentication cookies with HttpOnly, appropriate SameSite settings, and Secure when using HTTPS.
- [ ] Implement CSRF protection for cookie-authenticated requests.
- [ ] Invalidate sessions on logout, password changes, and administrator-initiated termination as appropriate.
- [ ] Prevent brute-force attacks using rate limits, temporary lockouts, and progressive delays.
- [ ] Send security emails for important events, such as successful login, password changes, and suspicious activity.
- [ ] Never log passwords, authentication tokens, verification codes, or reset secrets.

## 3. Authorization and User Permissions
- [ ] Enforce role-based access control on the backend, not only in React.
- [ ] Protect administrator routes and privileged API endpoints.
- [ ] Support extensible roles such as ADMIN, REGISTRAR, TEACHER, and ACCOUNTANT.
- [ ] Apply the principle of least privilege.
- [ ] Prevent users from changing their own role or privilege fields through requests.
- [ ] Validate record ownership and permissions for every read, update, and delete operation.
- [ ] Prevent insecure direct object reference (IDOR) attacks.
- [ ] Restrict access to student records, marks, financial records, and personal information according to role.
- [ ] Check permissions whenever a user accesses or modifies sensitive data.
- [ ] Record administrative permission changes in the audit log.

## 4. API and Input Security
- [ ] Validate request bodies, URL parameters, and query parameters using Zod or an equivalent schema validator.
- [ ] Sanitize or safely handle untrusted input according to its intended use.
- [ ] Prevent MongoDB NoSQL injection through strict validation and safe Mongoose queries.
- [ ] Never pass untrusted objects directly into MongoDB query operators.
- [ ] Use field allowlists to prevent mass-assignment and field-tampering attacks.
- [ ] Escape or safely render user-generated content to prevent XSS.
- [ ] Avoid unsafe HTML rendering unless the content is rigorously sanitized.
- [ ] Return only the fields the requester is authorized to see.
- [ ] Use consistent error handling without exposing stack traces, database details, or internal secrets.
- [ ] Apply request-size limits and suitable content-type checks.
- [ ] Configure CORS to allow only explicitly trusted frontend origins.
- [ ] Add rate limiting to login, registration, password reset, email verification, and sensitive API endpoints.
- [ ] Add bot protection where the threat level justifies it.

## 5. Database and Sensitive Data Protection
- [ ] Use a dedicated MongoDB database account with minimum required privileges.
- [ ] Keep database credentials exclusively on the backend.
- [ ] Enable MongoDB Atlas network access restrictions appropriate to the deployment.
- [ ] Use TLS for database connections outside trusted local development environments.
- [ ] Enforce record ownership and role-based query filters in application code.
- [ ] Do not assume React route guards or hidden buttons protect database records.
- [ ] Encrypt highly sensitive fields when justified by the threat model and implement secure key management.
- [ ] Protect database backups and exported reports.
- [ ] Avoid storing sensitive information that the system does not need.
- [ ] Add appropriate data-retention and deletion rules.
- [ ] Use MongoDB's actual access-control features rather than attempting to enable SQL-style row-level security.

## 6. File Upload Security
- [ ] Restrict allowed file extensions, MIME types, and file sizes.
- [ ] Verify actual file content rather than trusting the filename or client-provided MIME type.
- [ ] Generate safe server-side filenames.
- [ ] Prevent path traversal and executable uploads.
- [ ] Store private documents outside publicly served directories.
- [ ] Enforce authorization before allowing document downloads.
- [ ] Add malware scanning where appropriate for the deployment.
- [ ] Prevent unauthorized access to student documents and uploaded attachments.

## 7. HTTP and HTTPS Configuration
- [ ] Allow ordinary HTTP for local development, such as `http://localhost:5173` and `http://localhost:5000`.
- [ ] Do not force HTTPS or enable HSTS during HTTP-only local development.
- [ ] Configure cookies without the Secure attribute for HTTP-only localhost development when necessary; enable Secure when using HTTPS.
- [ ] Never assume HTTP is safe for production credentials or sensitive data.
- [ ] Require HTTPS for public production deployments.
- [ ] Use secure cookie settings and HSTS only when HTTPS is correctly configured.
- [ ] If deployed on an internal company LAN, restrict network access with firewall rules and consider HTTPS for sensitive traffic.
- [ ] Configure CORS separately for development and production.

## 8. Security Headers and Browser Protection
- [ ] Configure Helmet with appropriate security headers.
- [ ] Configure a suitable Content Security Policy.
- [ ] Prevent clickjacking using appropriate frame restrictions.
- [ ] Set suitable content-type and referrer policies.
- [ ] Review cross-origin resource policies for the application.
- [ ] Verify that security headers do not unnecessarily break the development frontend.

## 9. Active Sessions and Device Management
- [ ] Show administrators authorized information about active user sessions.
- [ ] Record login time, last activity, session ID, IP address, and user-agent information as appropriate.
- [ ] Treat device and location information as approximate, privacy-sensitive metadata.
- [ ] Allow administrators to terminate authorized users' sessions.
- [ ] Revoke server-tracked refresh sessions when terminated.
- [ ] Enforce session expiration and refresh-token rotation.
- [ ] Detect refresh-token reuse and revoke affected sessions when appropriate.
- [ ] Apply configurable device limits only if required by the institution.
- [ ] Do not rely on browser fingerprints as definitive proof of device identity.
- [ ] Audit session termination and other administrator actions.

## 10. Audit Logs and Monitoring
- [ ] Log successful and failed login attempts.
- [ ] Log security-sensitive events and account changes.
- [ ] Record who changed permissions, student records, marks, and other protected information.
- [ ] Record administrative actions with timestamps and relevant target identifiers.
- [ ] Prevent ordinary users from modifying or deleting audit logs.
- [ ] Restrict audit-log access to authorized roles.
- [ ] Avoid logging passwords, tokens, reset codes, or unnecessary personal information.
- [ ] Add alerts for suspicious login activity and repeated unauthorized requests.
- [ ] Monitor server errors and dependency security advisories.

## 11. Dependency and Code Security
- [ ] Remove unused and unnecessary packages.
- [ ] Review dependency vulnerabilities and update packages carefully.
- [ ] Review package scripts and dependency installation hooks.
- [ ] Run static analysis and secret-scanning tools.
- [ ] Check for exposed source maps, backups, environment files, and internal endpoints.
- [ ] Use safe defaults for Express and Mongoose.
- [ ] Review authentication, authorization, file-upload, and database-query code.
- [ ] Avoid trusting security claims made by generated code without testing them.

## 12. Security Testing and Final Audit
- [ ] Test unauthorized access to every protected endpoint.
- [ ] Test access to another student's or user's records.
- [ ] Test attempts to change roles and protected fields.
- [ ] Test login rate limits and verification-code expiration.
- [ ] Test session revocation after logout and administrator termination.
- [ ] Test NoSQL injection, XSS, CSRF, and IDOR protections.
- [ ] Test CORS and security headers in development and production configurations.
- [ ] Verify that private files and secrets cannot be retrieved over HTTP.
- [ ] Run dependency, static-analysis, and secret scans.
- [ ] Document unresolved findings and fix critical and high-severity vulnerabilities before production.
- [ ] Perform a final security audit and report the evidence for every completed item.

---

## 13. Analytics Dashboard and Charts (new)

### Design
- [ ] Each role gets its own dashboard: KPI cards on top (with a small trend line and change versus last month), charts in the middle, tables and alerts below.
- [ ] Glass look only on the header and cards' outer shell; chart areas stay flat and solid so scrolling stays smooth on low-end devices.
- [ ] Every chart has a skeleton loader, an empty state in plain words ("No payments recorded this month yet"), and an error state with a retry button.
- [ ] Charts are lazy-loaded (`React.lazy`) so the login and first screens never download the chart library.
- [ ] Cap data points (for example, 13 Ethiopian months or the last 30 days). Aggregate on the server, never send raw rows to draw a chart.
- [ ] Respect `prefers-reduced-motion`. Keep chart animation short or off.
- [ ] Charts never rely on color alone; add labels or patterns for accessibility.
- [ ] Filters: Ethiopian month, Ethiopian year, program, batch. Compare with the previous year where it makes sense.
- [ ] Axis labels, tooltips, and exports use Ethiopian month names (Meskerem to Pagume), not Gregorian.
- [ ] Every chart can export its data to Excel.

### Suggested charts per role
- [ ] **Admin:** users active right now (live), logins per day, failed logins and rate-limit hits, sessions by browser and device type, users by role, audit events by module, email delivery success rate, system health.
- [ ] **Registrar:** enrollments by Ethiopian month, students per program, status breakdown (active, graduated, dropped, transferred), batch fill rate, certificates issued.
- [ ] **Teacher:** attendance rate per course over time, attendance heatmap, grade distribution, Competent versus Not Yet Competent rate, students at risk (low attendance or low marks) for their own courses only.
- [ ] **Accountant:** collections per Ethiopian month, collected versus outstanding, overdue ageing buckets, payment method split, collections by program, top overdue balances, year-over-year comparison.

### Analytics security
- [ ] Analytics endpoints go through the same authentication, session check, and permission middleware as everything else.
- [ ] Scope aggregations on the server: a teacher's numbers only include their assigned courses, an accountant sees no grades or attendance.
- [ ] Do not put student names or other personal data in chart tooltips unless the role is allowed to see that record.
- [ ] Validate filter parameters with Zod. Never pass raw query values into an aggregation pipeline.
- [ ] Do not allow user-supplied field names or operators inside `$match`, `$group`, or `$sort`.
- [ ] Log exports of analytics data in the audit log.

### Analytics speed
- [ ] Store `ethYear` and `ethMonth` on payments, attendance, enrollments, and similar records when they are saved, and index them.
- [ ] Add compound indexes that match each dashboard query (for example `{ ethYear: 1, ethMonth: 1, programId: 1 }`).
- [ ] Cache dashboard results for 30 to 60 seconds per role and filter set, and invalidate on writes that change the numbers.
- [ ] Load KPI cards first and charts after, each from its own small endpoint, so the page appears at once.
- [ ] Use `$facet` or parallel requests carefully; measure before choosing.

---

## 14. Speed and Performance (new)

Targets below are goals to verify with a load test (`autocannon` or `k6`), measured on the server and excluding the user's network and Gmail delivery time. They are not guarantees.

| Action | Goal |
|---|---|
| Login (password check and session) | under about 400 ms at p95 |
| Verify a 6-digit code | under about 150 ms at p95 |
| Register | under about 400 ms at p95, without waiting for the email |
| Read or list (paginated) | under about 150 ms at p95 |
| Create, update, delete | under about 200 ms at p95 |
| Dashboard endpoint | under about 100 ms cached, under about 500 ms uncached |
| Login page JavaScript | aim for under about 200 KB gzipped |

### Login, register and codes
- [ ] Never make the user wait for an email. Save the code, respond "code sent" right away, and send the email from a background queue.
- [ ] Create the Nodemailer transport once with `pool: true` so every email doesn't open a new connection to Gmail.
- [ ] Look up users by an indexed, unique, lowercase email. Select only the fields login needs.
- [ ] Use native hashing (`argon2` or native `bcrypt`), which runs off the main thread. Do not use a pure-JavaScript bcrypt in production; it blocks every other request.
- [ ] Do not lower the hashing cost below recommended minimums just to look faster. Tune it so hashing takes roughly 100 to 250 ms on the production server, and keep it there.
- [ ] Hash 6-digit codes with HMAC-SHA256 and a server secret, not Argon2 or bcrypt. A 6-digit code is protected by the 5-minute expiry and the attempt limit, and HMAC is fast. Compare with `crypto.timingSafeEqual`.
- [ ] Put a TTL index on codes and sessions so cleanup needs no extra jobs.
- [ ] Do session checks with an indexed lookup, plus a short in-memory cache (about 30 seconds) or Redis. A forced logout must still take effect immediately through the socket and the next cache refresh.

### CRUD
- [ ] Paginate every list. Use cursor pagination for large collections.
- [ ] Use `.lean()` for read-only queries and `.select()` to return only needed fields.
- [ ] Avoid `populate` chains. Denormalize small display fields (for example, student name on an invoice) when it removes extra queries.
- [ ] Create indexes for every filter and sort used by the screens. Check slow queries with `.explain()`.
- [ ] Run independent queries with `Promise.all`.
- [ ] Write the audit log without blocking the response (queue it), but never drop it: retry on failure.
- [ ] Turn on `compression` for JSON responses. Set `Cache-Control: no-store` on private data, long cache on hashed static assets.
- [ ] Reuse one Mongoose connection with a sensible pool size. Never connect per request.

### Frontend feel
- [ ] Route-level code splitting. Load heavy things (charts, Excel import, rich forms) only when needed.
- [ ] Use TanStack Query: cached lists, background refresh, and optimistic updates for add, edit, and delete, with rollback on error.
- [ ] Debounce search inputs. Virtualize long tables.
- [ ] Show skeletons instead of spinners. Disable the submit button while saving to prevent double submits.
- [ ] Avoid heavy animation libraries. Prefer CSS transitions.

### Measure
- [ ] Add request timing to the logger and review the slowest routes weekly.
- [ ] Run a load test before release and after any big change. Record the results next to the targets above.

---

## 15. Injection, XSS and CSRF Protection (new)

### NoSQL injection
- [ ] Validate every body, param, and query with a **strict** Zod schema. Ids, emails, and codes must be `z.string()`, so an object like `{ "$gt": "" }` is rejected.
- [ ] Use `.strict()` on schemas so unknown fields fail instead of passing through.
- [ ] Set `mongoose.set('sanitizeFilter', true)` and `mongoose.set('strictQuery', true)`.
- [ ] Never write `Model.find(req.body)` or `Model.find(req.query)`. Build the filter from named, validated fields.
- [ ] Check ids with `mongoose.isValidObjectId` before querying.
- [ ] `express-mongo-sanitize` is optional extra defense. Check it works with your Express version; if it misbehaves, rely on Zod and `sanitizeFilter`.
- [ ] Escape user input before using it in `$regex` searches:

```js
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

- [ ] Never use `$where` or evaluate strings as code.
- [ ] Use `hpp` against duplicated query parameters.
- [ ] Block prototype pollution: never deep-merge raw request bodies into objects; keys like `__proto__` and `constructor` must be rejected.

Example of a strict schema:

```js
const loginSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).max(128),
}).strict();
```

### XSS
- [ ] Render user content as text in React. Avoid `dangerouslySetInnerHTML`.
- [ ] If rich text is truly needed (announcements, notices), sanitize on the server with `sanitize-html` using a small allowlist, and again on the client with `DOMPurify` before rendering.
- [ ] Never put tokens in `localStorage`. The access token lives in memory and the refresh token in an HttpOnly cookie.
- [ ] Block dangerous links: only allow `http:`, `https:`, and `mailto:` in user-provided URLs.
- [ ] Set a strict Content Security Policy through Helmet: no inline scripts, no `eval`, scripts only from your own origin. Test it in dev and in production builds.
- [ ] Escape user data in email templates (Handlebars escapes by default; do not use triple braces for user data).
- [ ] Set `X-Content-Type-Options: nosniff`, and serve uploads with a safe `Content-Disposition` so a file can never run as a page.

### Spreadsheet (formula) injection in exports
- [ ] In Excel and CSV exports, any text cell that starts with `=`, `+`, `-`, `@`, tab, or carriage return must be prefixed so it is treated as plain text:

```js
const safeCell = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
```

### CSRF
- [ ] The access token travels in the `Authorization` header, so normal API calls are not CSRF targets. The endpoints that rely on the **cookie** (`/auth/refresh`, `/auth/logout`) are the ones that need CSRF protection.
- [ ] Set refresh cookies with `HttpOnly`, `SameSite=Strict` (or `Lax` if you must), and `Secure` on HTTPS.
- [ ] Use a double-submit token with `csrf-csrf` (the old `csurf` package is deprecated, do not use it). Flow: the client fetches a token from a small endpoint, then sends it in an `X-CSRF-Token` header on cookie-based requests.
- [ ] Also check the `Origin` header on state-changing requests and reject unexpected origins.
- [ ] In production use the `__Host-` cookie prefix (needs HTTPS, `Path=/`, no `Domain`). In HTTP localhost development use a plain cookie name.
- [ ] Never allow state-changing actions through GET requests.
- [ ] Follow the package's own documentation for exact options, since they change between versions.

### Other injection and abuse
- [ ] Email header injection: reject newlines in any user value used in a subject, from, to, or reply-to.
- [ ] Path traversal: never build file paths from user input. Use generated ids.
- [ ] Log injection: log structured JSON (`pino`), never raw concatenated user strings.
- [ ] SSRF: do not let users supply URLs that the server fetches.
- [ ] Mass assignment: the allowlist of updatable fields lives in the service layer, per role.

---

## 16. Web Push Notifications and VAPID Keys (new)

VAPID keys let your server prove to the browser's push service that the push messages really come from you.

### Generate the keys (once)
```bash
cd server
npx web-push generate-vapid-keys
```
Copy the two values into `server/.env`:

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@yourschool.example
```
The **public** key is also given to the client as `VITE_VAPID_PUBLIC_KEY` in `client/.env`. The **private** key stays on the server only.

### Checklist
- [ ] Private key is never in React env, Git, logs, or API responses. Back it up securely.
- [ ] Do not rotate the keys casually. Changing them invalidates every existing subscription and users must subscribe again.
- [ ] Push needs HTTPS in production. `localhost` is allowed for development.
- [ ] Ask for notification permission only after a user action (for example, a "Turn on alerts" button), never on page load.
- [ ] Store each subscription per user and per device in a `pushSubscriptions` collection. Remove it when the push service answers 404 or 410, and when the user logs out of that device or the session is terminated.
- [ ] Only the authenticated owner can register or remove their own subscription (CSRF and IDOR checks apply).
- [ ] Keep the push payload small and non-sensitive ("You have a new notice"). Never put marks, balances, codes, or personal data in a push.
- [ ] Role and target rules for notifications apply to push too. The server decides who receives it, never the client.
- [ ] Rate limit push sending and send through the same queue as emails.
- [ ] Respect user settings: let each user turn push on or off per device.
- [ ] iPhone and iPad support web push only for sites added to the Home Screen. Check the current Apple requirements before promising it.

### Server sketch
```js
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

await webpush.sendNotification(subscription, JSON.stringify({ title, body, url }));
```

### Client sketch
- Register the service worker (use `vite-plugin-pwa` with the `injectManifest` strategy so you can write your own `push` and `notificationclick` handlers).
- Convert the base64url public key to a `Uint8Array`, then call `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
- Send the resulting subscription to `POST /api/push/subscribe`.
- Clear the service worker cache and subscriptions on logout.

---

## 17. Dependencies and npm Install Guide (new)

This section is the explicit permission for the packages listed here (see Mandatory Rule 4). Anything not listed needs approval first.

### Before you start
- [ ] Install the current Node.js LTS. Check with `node -v` and `npm -v`.
- [ ] Have a MongoDB Atlas cluster (or a local replica set, which finance transactions need).
- [ ] Verify each package name on npmjs.com before installing, and read its README for current setup. Versions and options change.
- [ ] Save exact versions so builds repeat: `npm config set save-exact true`.
- [ ] Commit `package-lock.json`. In CI and on the server use `npm ci`, not `npm install`.
- [ ] Do not install a release published in the last two weeks unless you must. Wait for the community to spot problems.
- [ ] For new or unfamiliar packages, review them first with `npm install --ignore-scripts`, then decide about install scripts.

### Project folders
```bash
mkdir sms && cd sms
mkdir server client
cd server
npm init -y
```
Set `"type": "module"` in `server/package.json` (some packages, such as `file-type`, are ESM-only).

### Server: core
```bash
npm install express mongoose dotenv cors helmet cookie-parser compression hpp zod
```

### Server: auth, sessions, CSRF
```bash
npm install argon2 jsonwebtoken csrf-csrf
npm install express-rate-limit rate-limiter-flexible
```
- `argon2` for password hashing (native, off the main thread).
- `jsonwebtoken` for the short-lived access token.
- `csrf-csrf` for CSRF double-submit protection.
- `express-rate-limit` for simple limits, `rate-limiter-flexible` for per-account and per-IP limits with a Mongo or Redis store.

### Server: XSS, sanitizing and injection helpers
```bash
npm install sanitize-html
# optional extra layer, check Express version compatibility first:
npm install express-mongo-sanitize
```

### Server: email, real-time, push
```bash
npm install nodemailer handlebars mjml
npm install socket.io web-push
```

### Server: device info, uploads, exports, logging
```bash
npm install ua-parser-js geoip-lite
npm install multer file-type
npm install exceljs docx
npm install pino pino-http
```

### Server: optional
```bash
npm install ioredis        # Redis for cache, rate limits, and job queues
```

### Server: development and testing
```bash
npm install -D nodemon eslint eslint-plugin-security prettier pino-pretty
npm install -D vitest supertest mongodb-memory-server
```
(Use Vitest or Jest, not both.)

### Server: scripts to add in `package.json`
```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "test": "vitest run",
    "lint": "eslint .",
    "audit": "npm audit --omit=dev"
  }
}
```

### Client
```bash
cd ../client
npm create vite@latest . -- --template react
npm install
npm install react-router-dom @tanstack/react-query axios zustand
npm install react-hook-form zod @hookform/resolvers
npm install tailwindcss @tailwindcss/vite
npm install lucide-react recharts
npm install @tanstack/react-table @tanstack/react-virtual
npm install socket.io-client dompurify sonner clsx tailwind-merge
npm install -D vite-plugin-pwa
```
- Tailwind v4 is added through the Vite plugin (`@tailwindcss/vite` in `vite.config.js`) and `@import "tailwindcss";` in your main CSS file. If you choose Tailwind v3, follow the v3 setup instead.
- Keep `zod` and `@hookform/resolvers` on compatible versions (check the resolver's docs).
- `recharts` is the default chart choice: easy, good looking, fine on most devices. If you later need heavy charts such as large heatmaps, consider Apache ECharts for those pages only, loaded lazily.

### Environment files

`server/.env` (never committed):

```
NODE_ENV=development
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=
JWT_ACCESS_SECRET=
COOKIE_SECRET=
CSRF_SECRET=
CODE_HMAC_SECRET=
SMTP_USER=
SMTP_APP_PASSWORD=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@yourschool.example
```

`client/.env` (public values only):

```
VITE_API_URL=http://localhost:5000/api
VITE_VAPID_PUBLIC_KEY=
```

Generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Express middleware order
1. `helmet`
2. `cors` (only `CLIENT_ORIGIN`)
3. `compression`
4. request id and `pino-http` logger
5. `express.json({ limit: '100kb' })`
6. `cookie-parser`
7. `hpp`
8. global rate limit
9. routes, each with: strict rate limit (auth routes) → CSRF (cookie routes only) → authenticate → session check → permission → validate (Zod) → controller
10. central error handler (no stack traces in production)

### Keep packages healthy
- [ ] Run `npm audit` and `npm outdated` every week and before every release.
- [ ] Update one package group at a time, run tests, then commit.
- [ ] Remove packages you no longer use (`npm uninstall <name>`).
- [ ] Run a secret scanner such as `gitleaks` on the repository (it is a separate tool, not an npm package).
- [ ] Keep the installed list documented here so the team knows what is approved.

---

## Mandatory Development Rules
1. Inspect the existing project before modifying files.
2. Preserve working functionality and the current architecture.
3. Do not claim a security feature is complete without verifying it.
4. Install only the packages approved in Section 17. Ask for explicit permission before adding anything else, and check that the package exists on npm and is actively maintained before installing it.
5. Do not invent packages, APIs, or configuration options.
6. Use HTTP for local development when requested, but never describe HTTP as secure for transmitting sensitive data over an untrusted network.
7. Keep development and production security settings separate.
8. After each change, run relevant tests and report failures honestly.
9. Prioritize critical vulnerabilities and explain any remaining risks.
10. Produce a final report listing implemented fixes, tests performed, unresolved issues, and recommended next steps.
11. Check the speed targets in Section 14 with a load test and report the real numbers, even when they miss the goal.
12. Never expose the VAPID private key or any other server secret to the client, to logs, or to Git.
