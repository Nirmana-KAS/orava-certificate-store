# Orava Certificate Store: Build Plan

> Status: **Draft for approval** (2026-10-30). Nothing gets built until this plan is approved.
> Developer: Shehan Nirmana · Company: orava (Pvt) Ltd. · © 2026 · Deploy: Vercel · Repo: new GitHub repo (private) · Commits: done manually by owner in GitHub Desktop.

---

## 1. Goal (one paragraph)

A secure, mobile-first web app where company-permitted people sign in with their **email plus a shared passkey**, then quickly **search, filter, sort, review and download** sensitive certificates (PDF, scanned image, or both). **One admin** uploads and manages everything. On upload the system **extracts key points and a summary**. It starts with **5 certificate types**, and the admin can add more types from the dashboard without code changes. The admin dashboard also has a **live System Map** (health, failures, alerts, one-click diagnose and fix) and a **Security Monitor** (attack detection and defenses).

**Success looks like:** a permitted user finds any certificate in under 5 seconds, sees its key points at a glance, previews it in the browser, and downloads the PDF, image, or both. The admin uploads a scan, checks the auto-filled fields, and saves in under a minute.

---

## 1a. Identity, branding and accounts

| Item | Value |
|---|---|
| App name | Orava Certificate Store |
| Company | orava (Pvt) Ltd. |
| Developer | Shehan Nirmana |
| Copyright | © 2026 orava (Pvt) Ltd. All rights reserved. |
| Logo | `orava-logo.png` (in the project folder, 1200×424 PNG, transparent). Will move to `public/brand/` and generate favicon, app icons (PWA) and social preview from it |
| Background | **White (#FFFFFF) on every page**, admin and user side. Brand colours taken from the logo for accents, buttons and badges only |
| Admin / alert email | shehannirmana.orava@gmail.com |
| GitHub + Vercel account email | shehannirmana2000job@gmail.com |

**Footer on every page:** logo (small) · "© 2026 orava (Pvt) Ltd." · "Developed by Shehan Nirmana" · app version (e.g. `v1.0.0`, read from `package.json`, plus short build/commit id from Vercel). The admin dashboard also shows the version and last deploy time on the System Map page. The README carries the same developer, company, copyright and version details.

**Email alerts note:** Resend's free plan, before you verify a domain, only sends to the email you signed up with. So sign up for Resend with **shehannirmana.orava@gmail.com** (or use a Gmail app password on that account as the fallback). Either way alerts reach the admin inbox for free.

---

## 1b. Responsive design (top priority)

The app must work well on **every phone, tablet and desktop**. This is treated as a hard requirement, tested automatically on every component, not a final polish step.

- **Mobile-first CSS:** designed at 320 px wide first, then enhanced at Tailwind breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536).
- **No horizontal scrolling on any page** at any width from 320 px up (checked by an automated test).
- **Tables become cards on phones**; filters move into a bottom sheet; navigation is a bottom bar on phones and a sidebar on larger screens.
- **Touch targets at least 44×44 px**, inputs at least 16 px font (stops iOS zoom-on-focus), safe-area padding for notched phones, works in portrait and landscape.
- **Viewers:** PDF and image preview fit the screen with pinch-zoom and swipe between pages/files.
- **System Map and Security pages on phones:** the diagram supports pinch-zoom and pan, and also has a "list view" of every component and connection with the same status colours, so nothing depends on a big screen.
- **Charts** resize with their container and switch to simpler layouts on small screens.
- **Fluid type and spacing** using `clamp()`, images served at the right size via `next/image`.

**Responsive test matrix (Playwright, runs on every change):**

| Device class | Viewports tested |
|---|---|
| Small phones | 320×568 (iPhone SE 1st gen), 360×640 (common Android) |
| Phones | 375×667 (iPhone SE), 390×844 (iPhone 13/14/15), 412×915 (Pixel / Galaxy), 430×932 (iPhone Pro Max) |
| Tablets | 768×1024 (iPad portrait), 1024×768 (landscape), 820×1180 (iPad Air) |
| Laptop / desktop | 1280×800, 1440×900, 1920×1080 |

Each page in each viewport is checked for: no horizontal overflow, nothing hidden or overlapping, tap targets big enough, and accessibility (axe-core). Screenshots are saved so you can review them. Browsers covered: Chrome/Edge (Chromium), Safari (WebKit, which is what iPhones use) and Firefox.

---

## 2. Recommended stack (all free tiers)

> **Rule: free technologies only.** Every service and library below is free (open-source or a free tier). No paid plan, paid API key or credit card is required. When a free limit is reached, the dashboard warns you; it never upgrades to a paid plan.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router) + React 19.3 + TypeScript 7** | One codebase for UI and API, first-class on Vercel |
| UI | **Tailwind CSS 4.3 + shadcn/ui (Radix)** | Modern, accessible (keyboard, ARIA) components, mobile-first |
| Tables / lists | TanStack Table + TanStack Query | Fast sort/filter/paginate |
| Diagrams | **React Flow (@xyflow/react)** | Interactive live System Map and attack map |
| Charts | Recharts | Dashboard KPIs, timelines |
| Database | **Supabase Postgres (free)** | 500 MB DB, full-text search, Realtime, Row Level Security |
| File storage | **Supabase Storage (private bucket)** | 1 GB, signed URLs that expire |
| Auth / sessions | Custom: allowlist + shared passkey (argon2 hash) + signed httpOnly cookie (`jose`) + sessions table | Fits "email + common passkey"; revocable |
| Admin 2FA | TOTP (`otplib`, any authenticator app) | Free, strong |
| PDF text | `unpdf` / `pdfjs-dist` | Reads text layer of digital PDFs |
| OCR (scans) | **Tesseract.js, runs in the admin's browser** | Free, private (file never leaves your control), no server time limits |
| PDF/image tools | `pdf-lib`, `jszip`, browser image compression | Watermarks, image to PDF, "download both" zip |
| Email alerts | **Resend free** (fallback: Gmail SMTP app password via Nodemailer) | 3,000 emails/month, 100/day |
| Scheduled checks | **cron-job.org (free, every 1 to 5 min)** + GitHub Actions backup schedule | Vercel Hobby cron only runs once per day |
| Rate limiting | Postgres counters (optionally Upstash Redis free) | Brute force and abuse protection |
| Validation | zod + react-hook-form | Typed, safe inputs |
| Tests | Vitest + Playwright | Unit + end-to-end |
| Hosting | **Vercel Hobby** (see caveat below) | Your requirement |

Package manager: pnpm. Runtime: Node.js LTS.

### Version policy: latest stable only

Every package uses its **latest stable release** (npm `latest` tag; never beta, rc, canary or preview). Versions are pinned exactly in `package.json` with a lockfile, and Dependabot opens a PR for each new stable release so the stack stays current. Checked on npm/nodejs.org on **2026-10-30**:

| Package | Version | Package | Version |
|---|---|---|---|
| Node.js (LTS "Lithium") | 26.13.0 | pnpm | 12.16.1 |
| next | 16.4.3 | react / react-dom | 19.3.1 |
| typescript | 7.0.2 | tailwindcss | 4.3.3 |
| shadcn (CLI) | 4.23.0 | radix-ui | 1.8.1 |
| lucide-react | 1.65.0 | @tanstack/react-query | 5.105.0 |
| @tanstack/react-table | 9.3.1 | @xyflow/react | 12.12.0 |
| recharts | 3.10.1 | react-hook-form | 7.91.0 |
| zod | 4.6.7 | @supabase/supabase-js | 2.118.0 |
| @supabase/ssr | 0.12.7 | supabase (CLI) | 2.122.0 |
| jose | 6.2.14 | @node-rs/argon2 | 2.2.2 |
| otplib | 13.5.0 | unpdf | 2.0.1 |
| pdfjs-dist | 6.4.299 | tesseract.js | 7.0.0 |
| pdf-lib | 1.17.1 | jszip | 3.10.2 |
| browser-image-compression | 2.0.2 | resend | 6.35.0 |
| nodemailer | 10.3.1 | vitest | 5.0.5 |
| @playwright/test | 1.64.1 | @axe-core/playwright | 4.14.0 |
| eslint | 10.13.0 | prettier | 3.9.10 |

Notes: versions are re-checked on the day Phase 0 starts. On Vercel the project uses the newest Node.js LTS that Vercel offers. If any tool turns out to be incompatible with TypeScript 7 (the new native compiler), I will say so before falling back.

### Important free-tier caveats (please read)

1. **Vercel Hobby is for personal, non-commercial use** per Vercel's terms. A company tool is technically commercial. Both options stay free: (a) use Vercel Hobby and accept that risk, or (b) Cloudflare Workers free tier, which allows commercial use (Next.js runs there via the OpenNext adapter). I will keep the code portable so switching between the two is a config change, not a rewrite. **Your call.**
2. **Supabase free pauses a project after ~7 days with no activity.** Our health checks hit the database every few minutes, which keeps it awake.
3. **Supabase free has no automatic backups.** I will add an admin "Export backup" button (database JSON + all files as a zip to your PC) and a weekly reminder.
4. **Storage is 1 GB.** With browser-side compression, a scan is ~0.3 to 1 MB, so roughly **1,000 to 3,000 certificates**. Dashboard shows usage and warns at 80%.
5. **Vercel functions accept at most ~4.5 MB per request.** Files therefore upload directly from the browser to Supabase Storage using a one-time signed upload URL (up to 50 MB per file on free).
6. **Repo should be private** (sensitive business app). GitHub Actions on private repos gets 2,000 free minutes/month, which is plenty.

---

## 3. Architecture

```
 Browser (mobile-first UI, PDF viewer, OCR in admin's browser)
      │  HTTPS (Vercel edge: TLS, DDoS mitigation, geo headers)
      ▼
 Next.js on Vercel
  ├─ proxy.ts (Next 16's name for middleware) ── session check, IP blocklist, rate limit, security headers
  ├─ Server Components / Server Actions (UI data)
  ├─ /api/*  (auth, certificates, upload-url, download, health, diagnose, security)
  │      │ service-role key (server only; browser never talks to DB directly)
  │      ▼
  │   Supabase ── Postgres (data, search, logs) ── Storage (private files) ── Realtime (live dashboard)
  ├─ Email ── Resend (alerts)
  └─ Optional AI ── off by default (see §6)

 cron-job.org ──(every 1-5 min, secret header)──► /api/health/run  → writes health_checks, raises incidents, emails admin
 GitHub Actions ──(weekly)──► dependency audit (Dependabot), backup reminder
```

Key security rule: **the browser never gets database or storage credentials.** All reads go through our API, which checks the session, logs the action, and hands out a signed URL valid for ~60 seconds.

---

## 4. Data model (Postgres)

| Table | Main columns |
|---|---|
| `users` | id, email (unique), name, role (`admin`/`viewer`), status (`active`/`disabled`), can_download, last_login_at, created_at |
| `app_settings` | passkey_hash, passkey_rotated_at, session_hours, lockdown_mode, alert_email, ai_enabled |
| `admin_credentials` | user_id, password_hash, totp_secret (encrypted), recovery_codes_hash |
| `sessions` | id (jti), user_id, ip, user_agent, country, created_at, expires_at, revoked_at |
| `certificate_types` | id, name, slug, icon, color, description, **fields (jsonb schema)**, **extraction_rules (jsonb)**, **summary_template**, expiry_warning_days, active, sort_order |
| `certificates` | id, type_id, title, cert_number, holder_name, issuer, issue_date, expiry_date, status (computed: valid/expiring/expired), **data (jsonb, type-specific fields)**, key_points (text[]), summary, ocr_text, tags, search (tsvector), created_by, timestamps, deleted_at (soft delete) |
| `certificate_files` | id, certificate_id, kind (`pdf`/`image`), storage_path, mime, size, sha256 (duplicate check), pages, thumbnail_path |
| `audit_logs` | actor, action (login, view, download, upload, edit, delete, settings…), target, ip, user_agent, meta, at |
| `security_events` | kind, severity, ip, email, path, country, detail, at |
| `ip_blocks` | ip/cidr, reason, expires_at, created_by |
| `health_checks` | component, status (ok/degraded/down), latency_ms, sample (redacted), detail, at |
| `incidents` | component, severity, title, opened_at, resolved_at, **diagnosis_report (jsonb)** |

Row Level Security is **enabled with deny-all** on every table, so even a leaked anon key reads nothing. Only the server (service role) can access data.

**Configurable types:** each `certificate_types.fields` entry looks like
`{ key: "standard", label: "Standard", type: "text|date|number|select", required: true, showInList: true, filterable: true }`
and `extraction_rules` holds hints such as anchor words ("Certificate No", "Valid until"), regex, and date formats. The upload form, filters, list columns and summary are all generated from this config, so a 6th type needs **no code**.

---

## 5. Features, and what is possible free

Legend: ✅ fully free · ⚠️ free but scaled down · ❌ not realistic free

### 5.1 Sign-in and access
| Feature | Free? | Notes |
|---|---|---|
| Email allowlist + shared passkey | ✅ | Admin adds/removes emails; passkey stored as argon2 hash |
| Admin login: own password + TOTP 2FA | ✅ | Admin never uses the shared passkey |
| Session timeout, "sign out everywhere", revoke a user's sessions | ✅ | Sessions table |
| Rotate shared passkey (signs everyone out) | ✅ | One click in Settings |
| Optional email one-time code on a new device | ✅ | Resend 100/day limit is fine for a small team. Recommended because a shared passkey alone is weak |
| WebAuthn "passkeys" (fingerprint/Face ID) for admin | ✅ | Optional later (note: different from your "common passkey") |

### 5.2 Certificate upload and extraction (admin)
| Feature | Free? | Notes |
|---|---|---|
| Upload PDF, image (JPG/PNG/WebP/HEIC), or both for one certificate | ✅ | Drag-drop, phone camera capture |
| File checks: real type by magic bytes, size limit, duplicate detection (SHA-256) | ✅ | |
| Image cleanup: auto-rotate, compress, optional "convert image to PDF" | ✅ | In browser |
| Text from digital PDFs | ✅ | Accurate |
| OCR for scans | ⚠️ | Tesseract.js in the admin's browser. Good on clean 300 dpi scans; weaker on stamps, handwriting, low-quality photos. Takes ~5 to 20 s per page |
| Key fields auto-filled per type (number, holder, issuer, dates…) | ⚠️ | Rule-based using each type's anchors/regex. I will tune rules with your 5 sample certificates. **Admin always reviews and corrects before saving** |
| Key points + summary | ⚠️ | Generated from extracted fields via each type's summary template (reliable, private). Free-form "AI-written" summaries only if you enable optional AI (§6) |
| Edit, replace file, soft delete, restore | ✅ | |
| Bulk upload | ⚠️ | Supported, but OCR runs one file at a time in the browser |
| Server-side virus scanning | ❌ | No free option that keeps files private (VirusTotal shares uploads). Risk is low since only the admin uploads; we do strict type checks instead |

### 5.3 Search, review, download (all permitted users)
| Feature | Free? | Notes |
|---|---|---|
| Instant search (number, holder, issuer, any OCR text), typo-tolerant | ✅ | Postgres full-text + trigram |
| Filters: type, status (valid/expiring/expired), issuer, date ranges, tags, type-specific fields | ✅ | Shareable URL filters |
| Sort by any column; card view (mobile) and table view (desktop) | ✅ | |
| Detail page: key points, summary, all fields, thumbnails | ✅ | |
| In-browser preview: PDF viewer, image zoom/pan, side-by-side PDF + image | ✅ | |
| Download PDF, image, or both (zip) | ✅ | Signed links expire in ~60 s |
| Optional watermark on download ("Downloaded by name@… on date") | ✅ | pdf-lib; deters leaks |
| Expiry warnings (badge + optional email digest to admin) | ✅ | |
| Every view/download is logged | ✅ | Visible to admin |
| Keyboard shortcuts, WCAG 2.2 AA | ✅ | White background throughout (no dark theme, per brand requirement) |
| Installable app (PWA) on phones | ✅ | Files are not cached offline, on purpose (sensitive) |

### 5.4 Admin dashboard (full control)
| Feature | Free? |
|---|---|
| Overview: totals by type/status, expiring soon, recent uploads, recent activity, storage/DB usage meters | ✅ |
| Users: add/disable/remove, per-user download permission, see sessions, force sign-out, activity history | ✅ |
| Certificates: everything above + bulk actions + export list to CSV | ✅ |
| Certificate types: create/edit fields, extraction rules, summary template, icon/colour, test rules against a sample file | ✅ |
| Settings: passkey rotation, session length, alert email, lockdown mode, AI on/off | ✅ |
| Audit log viewer with filters and CSV export | ✅ |
| Backup export (DB + files zip) | ✅ |

### 5.5 System Map page (live)
An interactive diagram of every part of the system and each connection between them:

`Browser/UI → Vercel Edge → Middleware (auth gate) → API routes → Postgres`, `→ Storage`, `→ Realtime`, `→ Email (Resend)`, `→ OCR (browser)`, `→ optional AI`, `cron-job.org → Health API`.

| Feature | Free? | Notes |
|---|---|---|
| Nodes and edges coloured green/amber/red with latency and last-OK time | ✅ | React Flow |
| Click a connection to see what flows through it, with **redacted sample data** and a plain-English explanation (e.g. "API → Storage: request signed URL `{path: certs/…/a1b2.pdf, expiresIn: 60}`") | ✅ | |
| Real-time updates | ✅ | Supabase Realtime pushes new health results while the page is open (free: 200 concurrent connections) |
| Background checks when nobody is watching | ⚠️ | Every 1 to 5 minutes via cron-job.org, not truly continuous |
| Failure highlighting: broken node/edge pulses red, root cause highlighted (e.g. DB down → everything after it shown as "affected", not "failed") | ✅ | |
| Critical banner + bell in dashboard | ✅ | |
| Email alert to you | ✅ | Resend; de-duplicated (one email per incident, plus "resolved" email), daily cap respected |
| What it can't see | ⚠️ | If **Vercel itself** is down, the app can't report it. cron-job.org's own failure email covers that case (free) |
| **One-click "Diagnose & Fix"** | ⚠️ | See below |

**What "Diagnose & Fix" really does (honest scope):**
It runs a fixed checklist for the failing part, applies only **safe, pre-approved remediations**, re-tests, and writes a report.

- **Checks:** env variables present, DB reachable + query latency, RLS still on, storage bucket reachable + private, signed URL round-trip, email provider reachable, Realtime connection, extraction failures queue, quota usage (DB/storage/email), SSL/headers, recent error spikes, Supabase paused?
- **Safe automatic fixes:** retry with backoff, warm/reconnect DB, clear app caches (revalidate), regenerate thumbnails, re-run failed extractions, re-send queued emails, purge expired sessions, unblock self-locked admin IP, trigger a Vercel redeploy via Deploy Hook.
- **Cannot auto-fix (report tells you exactly what to do, with links):** bugs in code, provider outages, a paused Supabase project (one click in Supabase), exceeded free quotas, wrong/expired secrets, plan limits.
- **Report:** what failed, every check run with result, what was changed, final status, time taken; saved to `incidents`, viewable and downloadable.

### 5.6 Security Monitor page
Shown the same way as the System Map: a live view with severity colours, a feed, and one-click responses.

**Defenses (always on):**
| Defense | Free? |
|---|---|
| HTTPS/TLS, platform DDoS mitigation, Attack Challenge Mode toggle | ✅ (Vercel, all plans) |
| Strict security headers: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy | ✅ |
| Rate limits on login, search and download; progressive lockout after failed passkey/password attempts | ✅ |
| IP blocklist (manual + automatic temporary blocks) | ✅ |
| CSRF protection (SameSite cookies + origin check), zod validation on all inputs, parameterised queries | ✅ |
| Private storage, 60 s signed URLs, RLS deny-all, server-only secrets | ✅ |
| Lockdown mode (only admin can sign in) and "sign out everyone" | ✅ |
| Dependency vulnerability alerts (Dependabot) | ✅ (GitHub) |
| CodeQL code scanning | ⚠️ Free only on public repos |

**Detection (feeds the page and email alerts):**
- Passkey/password brute force; one IP trying many emails (credential stuffing); unknown emails trying to sign in
- Sign-in from a new country or device (Vercel geo headers); admin login from a new device
- Unusual downloads (e.g. a user downloading 30+ certificates in 10 min, a sign of data theft)
- Scanner/probe traffic (`/wp-admin`, `/.env`, `/phpmyadmin`) via honeypot routes, auto-blocked
- SQL-injection / XSS-looking input patterns
- Session token reuse from a different IP/browser
- Config drift: RLS turned off, bucket made public, security header missing

**Page shows:** threat level gauge, live attack feed, world map of sources, top offending IPs, timeline chart, defense status checklist with a security score, and one-click actions (block IP, revoke sessions, rotate passkey, disable user, lockdown). Critical events also send email.

**Not possible free (stated plainly):** network-level intrusion detection (no raw traffic access on Vercel), an enterprise WAF with managed rule sets, stopping very large volumetric DDoS beyond what Vercel absorbs, a full SIEM, penetration testing as a service. What we build is strong **application-level** monitoring and defense, which is the right fit for this app.

---

## 6. Optional AI (off by default)

Free AI APIs (e.g. Google Gemini free tier) could read scans and write natural summaries better than rules. **But on free tiers the provider may use your data to improve its models**, which conflicts with "sensitive certificates." So the plan uses the private, free, rule-based pipeline only. The AI toggle stays **off**; it exists only so you can try the free Gemini tier on non-sensitive test files if you ever want to compare. No paid services are used anywhere in this plan.

---

## 7. UI/UX principles
- Fully responsive on every device (see §1b), mobile-first; bottom navigation on phones, sidebar on desktop
- White background on all pages, orava logo in the header, company footer on every page (see §1a)
- Search box always on top; results update as you type (debounced)
- Colour-coded type chips and status badges (never colour alone: icons + text too)
- WCAG 2.2 AA: contrast, focus rings, full keyboard use, screen-reader labels, reduced-motion support
- Skeleton loading, empty states that explain the next step
- Target: Lighthouse 90+ for performance and accessibility

---

## 8. Repo layout (planned)

```
orava-certificate-store/
├─ app/
│  ├─ (auth)/login, admin-login
│  ├─ (app)/certificates, certificates/[id]
│  ├─ admin/ overview, users, certificates, types, upload, audit, system-map, security, settings
│  └─ api/ auth, certificates, files, health, diagnose, security, backup
├─ components/ (ui/, certificates/, admin/, system-map/, security/)
├─ lib/ (auth, db, storage, extraction/, health/, security/, email)
├─ supabase/migrations/ (SQL schema, RLS, seed of 5 types)
├─ tests/ (unit, e2e)
├─ .github/ (dependabot.yml, workflows/)
├─ proxy.ts
├─ README.md · .gitignore · .gitattributes · .env.example · LICENSE (private)
```

---

## 9. Build phases

| # | Phase | Outcome you can check |
|---|---|---|
| 0 | Scaffold: Next.js, Tailwind, shadcn, lint/format, README, .gitignore, .gitattributes, .env.example | Runs locally; you commit + push; first Vercel deploy |
| 1 | Supabase schema + RLS + auth (allowlist, passkey, admin password + TOTP, sessions) | You and a test user can sign in |
| 2 | Certificate types (config UI, seed 5 types) + upload (direct to storage) + manual fields | Admin uploads a certificate |
| 3 | Extraction: PDF text, browser OCR, per-type rules, key points + summary; tuned with your samples | Auto-filled fields on your real examples |
| 4 | Search, filters, sort, detail, preview, downloads (PDF/image/zip), watermark, audit logging | Users find and download in seconds |
| 5 | Admin dashboard: overview, users, certificates, audit, settings, backup | Full admin control |
| 6 | System Map: health probes, React Flow map, Realtime, incidents, email alerts, Diagnose & Fix + reports | Break something on purpose, watch it go red, get email, fix it |
| 7 | Security Monitor: detections, defenses, page, actions, alerts | Simulated brute force gets detected and blocked |
| 8 | Hardening: full responsive matrix review, accessibility audit, performance, docs | Ready for daily use |

The responsive test matrix (§1b) is set up in Phase 0 and runs from the first page onward, so every component is checked on phone sizes as it is built.

Each phase ends with a short "what changed" note so you can review and commit in GitHub Desktop.

---

## 10. Accounts you'll need (all free)
1. GitHub (shehannirmana2000job@gmail.com): new **private** repo `orava-certificate-store` (create it from GitHub Desktop: *File → Add local repository* on this folder, then *Publish*)
2. Vercel (shehannirmana2000job@gmail.com; Hobby, or decide per caveat §2.1), linked to the repo
3. Supabase (free project, region close to your users, e.g. Singapore for Sri Lanka)
4. Resend (free), signed up with shehannirmana.orava@gmail.com so alerts can reach that inbox, or a Gmail app password on that account
5. cron-job.org (free) for scheduled health checks

I will give step-by-step setup notes for each in the README. Secrets go only into Vercel environment variables and your local `.env.local` (git-ignored), never into the repo.

---

## 11. Decisions needed from you
1. **Approve this plan** (or tell me what to change).
2. **Hosting (both free):** Vercel Hobby despite the non-commercial rule, or Cloudflare free? (I recommend starting on Vercel Hobby with portable code.)
3. **AI summaries:** keep off (private, rule-based) for now? (Recommended: yes.)
4. **Extra sign-in step:** add email one-time code on new devices? (Recommended: yes.)
5. **Names of the 5 certificate types** and one sample of each, when ready.

---

## 12. Which Claude model to use per phase (token saving)

Use **Sonnet** for routine building and **Opus** where a mistake would be costly (security, auth, tricky logic). Switch the model before starting each phase. Starting each phase in a fresh thread also saves tokens, because `CLAUDE.md` and this plan carry the context.

| Phase | Model | Why |
|---|---|---|
| 0 Setup, branding, test matrix | Sonnet | Standard scaffolding *(already done)* |
| 1 Database, sign-in, sessions, admin 2FA | **Opus** | Security-critical: passkey hashing, sessions, rate limits, RLS |
| 2 Certificate types + upload | Sonnet | Forms, storage upload, CRUD |
| 3 Extraction (PDF text, OCR, rules, summary) | **Opus** | Hardest logic; accuracy matters |
| 4 Search, filters, preview, downloads | Sonnet | UI and queries (use Opus only for search ranking tuning if needed) |
| 5 Admin dashboard | Sonnet | Mostly UI pages |
| 6 System Map, alerts, Diagnose & Fix | **Opus** | Health checks, failure detection and safe auto-fix logic |
| 7 Security Monitor | **Opus** | Attack detection and defenses |
| 8 Hardening | Sonnet, then **Opus** | Sonnet for tests, docs and responsive fixes; Opus for one final security review |

Small fixes, copy changes, README edits and new pages in an existing pattern: always Sonnet.
