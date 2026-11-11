# Orava Certificate Store: Build Plan

> Status: **Draft for approval** (2026-10-30). Nothing gets built until this plan is approved.
> Developer: Shehan Nirmana · Company: orava (Pvt) Ltd. · © 2026 · Deploy: Vercel · Repo: new GitHub repo (private) · Commits: done manually by owner in GitHub Desktop.

---

## 1. Goal (one paragraph)

A secure, mobile-first web app where company-permitted people sign in with their **email plus a shared passkey**, then quickly **search, filter, sort, review and download** sensitive certificates (PDF, scanned image, or both). **One admin** uploads and manages everything. On upload the system **extracts key points and a summary**. It starts with **5 certificate types**, and the admin can add more types from the dashboard without code changes. The admin dashboard also has a **live System Map** (health, failures, alerts, one-click diagnose and fix) and a **Security Monitor** (attack detection and defenses).

**Success looks like:** a permitted user finds any certificate in under 5 seconds, sees its key points at a glance, previews it in the browser, and downloads the PDF, image, or both. The admin uploads a scan, checks the auto-filled fields, and saves in under a minute.

---

## 1a. Identity, branding and accounts

| Item                          | Value                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App name                      | Orava Certificate Store                                                                                                                                            |
| Company                       | orava (Pvt) Ltd.                                                                                                                                                   |
| Developer                     | Shehan Nirmana                                                                                                                                                     |
| Copyright                     | © 2026 orava (Pvt) Ltd. All rights reserved.                                                                                                                       |
| Logo                          | `orava-logo.png` (in the project folder, 1200×424 PNG, transparent). Will move to `public/brand/` and generate favicon, app icons (PWA) and social preview from it |
| Background                    | **White (#FFFFFF) on every page**, admin and user side. Brand colours taken from the logo for accents, buttons and badges only                                     |
| Admin / alert email           | shehannirmana.orava@gmail.com                                                                                                                                      |
| GitHub + Vercel account email | shehannirmana2000job@gmail.com                                                                                                                                     |

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

| Device class     | Viewports tested                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Small phones     | 320×568 (iPhone SE 1st gen), 360×640 (common Android)                                              |
| Phones           | 375×667 (iPhone SE), 390×844 (iPhone 13/14/15), 412×915 (Pixel / Galaxy), 430×932 (iPhone Pro Max) |
| Tablets          | 768×1024 (iPad portrait), 1024×768 (landscape), 820×1180 (iPad Air)                                |
| Laptop / desktop | 1280×800, 1440×900, 1920×1080                                                                      |

Each page in each viewport is checked for: no horizontal overflow, nothing hidden or overlapping, tap targets big enough, and accessibility (axe-core). Screenshots are saved so you can review them. Browsers covered: Chrome/Edge (Chromium), Safari (WebKit, which is what iPhones use) and Firefox.

---

## 2. Recommended stack (all free tiers)

> **Rule: free technologies only.** Every service and library below is free (open-source or a free tier). No paid plan, paid API key or credit card is required. When a free limit is reached, the dashboard warns you; it never upgrades to a paid plan.

| Layer            | Choice                                                                                                                           | Why                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Framework        | **Next.js 16 (App Router) + React 19.3 + TypeScript 7**                                                                          | One codebase for UI and API, first-class on Vercel                    |
| UI               | **Tailwind CSS 4.3 + shadcn/ui (Radix)**                                                                                         | Modern, accessible (keyboard, ARIA) components, mobile-first          |
| Tables / lists   | TanStack Table + TanStack Query                                                                                                  | Fast sort/filter/paginate                                             |
| Diagrams         | **React Flow (@xyflow/react)**                                                                                                   | Interactive live System Map and attack map                            |
| Charts           | Recharts                                                                                                                         | Dashboard KPIs, timelines                                             |
| Database         | **Supabase Postgres (free)**, reached from the server with the `postgres` driver                                                 | 500 MB DB, full-text search, Row Level Security (deny-all)            |
| File storage     | **Supabase Storage (private bucket)**                                                                                            | 1 GB, signed URLs that expire                                         |
| Auth / sessions  | Custom: allowlist + shared passkey (Argon2id) + random session token in an httpOnly `__Host-` cookie, hashed in a sessions table | Fits "email + common passkey"; instantly revocable                    |
| Admin 2FA        | TOTP (`otplib`, any authenticator app)                                                                                           | Free, strong                                                          |
| PDF text         | `unpdf` / `pdfjs-dist`                                                                                                           | Reads text layer of digital PDFs                                      |
| OCR (scans)      | **Tesseract.js, runs in the admin's browser**                                                                                    | Free, private (file never leaves your control), no server time limits |
| PDF/image tools  | `pdf-lib`, `jszip`, browser image compression                                                                                    | Watermarks, image to PDF, "download both" zip                         |
| Email alerts     | **Resend free** (fallback: Gmail SMTP app password via Nodemailer)                                                               | 3,000 emails/month, 100/day                                           |
| Scheduled checks | **cron-job.org (free, every 1 to 5 min)** + GitHub Actions backup schedule                                                       | Vercel Hobby cron only runs once per day                              |
| Rate limiting    | Postgres counters (optionally Upstash Redis free)                                                                                | Brute force and abuse protection                                      |
| Validation       | zod + react-hook-form                                                                                                            | Typed, safe inputs                                                    |
| Tests            | Vitest + Playwright                                                                                                              | Unit + end-to-end                                                     |
| Hosting          | **Vercel Hobby** (see caveat below)                                                                                              | Your requirement                                                      |

Package manager: pnpm. Runtime: Node.js LTS.

### Version policy: latest stable only

Every package uses its **latest stable release** (npm `latest` tag; never beta, rc, canary or preview). Versions are pinned exactly in `package.json` with a lockfile, and Dependabot opens a PR for each new stable release so the stack stays current. Checked on npm/nodejs.org on **2026-10-30**:

| Package                   | Version | Package               | Version |
| ------------------------- | ------- | --------------------- | ------- |
| Node.js (LTS "Lithium")   | 26.13.0 | pnpm                  | 12.16.1 |
| next                      | 16.4.3  | react / react-dom     | 19.3.1  |
| typescript                | 7.0.2   | tailwindcss           | 4.3.3   |
| shadcn (CLI)              | 4.23.0  | radix-ui              | 1.8.1   |
| lucide-react              | 1.65.0  | @tanstack/react-query | 5.105.0 |
| @tanstack/react-table     | 9.3.1   | @xyflow/react         | 12.12.0 |
| recharts                  | 3.10.1  | react-hook-form       | 7.91.0  |
| zod                       | 4.6.7   | @supabase/supabase-js | 2.118.0 |
| @supabase/ssr             | 0.12.7  | supabase (CLI)        | 2.122.0 |
| jose                      | 6.2.14  | @node-rs/argon2       | 2.2.2   |
| otplib                    | 13.5.0  | unpdf                 | 2.0.1   |
| pdfjs-dist                | 6.4.299 | tesseract.js          | 7.0.0   |
| pdf-lib                   | 1.17.1  | jszip                 | 3.10.2  |
| browser-image-compression | 2.0.2   | resend                | 6.35.0  |
| nodemailer                | 10.3.1  | vitest                | 5.0.5   |
| @playwright/test          | 1.64.1  | @axe-core/playwright  | 4.14.0  |
| eslint                    | 10.13.0 | prettier              | 3.9.10  |

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

| Table               | Main columns                                                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`             | id, email (unique), name, role (`admin`/`viewer`), status (`active`/`disabled`), can_download, last_login_at, created_at                                                                                                                                                                |
| `app_settings`      | passkey_hash, passkey_rotated_at, session_hours, lockdown_mode, alert_email, ai_enabled                                                                                                                                                                                                 |
| `admin_credentials` | user_id, password_hash, totp_secret (encrypted), recovery_codes_hash                                                                                                                                                                                                                    |
| `sessions`          | id (jti), user_id, ip, user_agent, country, created_at, expires_at, revoked_at                                                                                                                                                                                                          |
| `certificate_types` | id, name, slug, icon, color, description, **fields (jsonb schema)**, **extraction_rules (jsonb)**, **summary_template**, lab, **fingerprints (text[])**, **core_roles (jsonb)**, expiry_tracking, expiry_warning_days, sample_file_path, version, active (archived = false), sort_order |
| `certificates`      | id, type_id, title, cert_number, holder_name, issuer, issue_date, expiry_date, status (computed: valid/expiring/expired), **data (jsonb, type-specific fields)**, key_points (text[]), summary, ocr_text, tags, search (tsvector), created_by, timestamps, deleted_at (soft delete)     |
| `certificate_files` | id, certificate_id, kind (`pdf`/`image`), storage_path, mime, size, sha256 (duplicate check), pages, thumbnail_path                                                                                                                                                                     |
| `audit_logs`        | actor, action (login, view, download, upload, edit, delete, settings…), target, ip, user_agent, meta, at                                                                                                                                                                                |
| `security_events`   | kind, severity, ip, email, path, country, detail, at                                                                                                                                                                                                                                    |
| `ip_blocks`         | ip/cidr, reason, expires_at, created_by                                                                                                                                                                                                                                                 |
| `health_checks`     | component, status (ok/degraded/down), latency_ms, sample (redacted), detail, at                                                                                                                                                                                                         |
| `system_switches`   | section (or `all`), state (`on`/`readonly`/`hold`/`down`), message, until_at, reason, changed_by, changed_at                                                                                                                                                                            |
| `switch_scopes`     | id, switch_id, scope (`user`/`group`/`type`), target_id: the group/type switches (§5.7 #10)                                                                                                                                                                                             |
| `switch_schedules`  | id, section, state, message, starts_at, ends_at, repeat (none/daily/weekly), timezone, active                                                                                                                                                                                           |
| `switch_presets`    | id, name, states (jsonb)                                                                                                                                                                                                                                                                |
| `user_groups`       | id, name; plus `user_group_members` (group_id, user_id)                                                                                                                                                                                                                                 |
| `control_access`    | control_passkey_hash, failed_count, locked_until, rescue_token_hash, rescue_expires_at, auto_protect (jsonb)                                                                                                                                                                            |
| `incidents`         | component, severity, title, opened_at, resolved_at, **diagnosis_report (jsonb)**                                                                                                                                                                                                        |

Row Level Security is **enabled with deny-all** on every table, so even a leaked anon key reads nothing. Only the server (service role) can access data.

**Configurable types:** each `certificate_types.fields` entry looks like
`{ key: "report_no", label: "Report No", type: "text|long_text|number|carat|date|select|multi_select|table", required: true, showInList: true, filterable: true, role: "report_number" }` (a `table` field also has `columns: [...]`)
and `extraction_rules` holds hints such as label words ("Report No", "Date of Issue"), value pattern presets or regex, and clean-up rules. See §5.2a for the 4 sample types and the admin wizard. The upload form, filters, list columns and summary are all generated from this config, so a 6th type needs **no code**.

---

## 5. Features, and what is possible free

Legend: ✅ fully free · ⚠️ free but scaled down · ❌ not realistic free

### 5.1 Sign-in and access

| Feature                                                          | Free? | Notes                                                                                             |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Email allowlist + shared passkey                                 | ✅    | Admin adds/removes emails; passkey stored as argon2 hash                                          |
| Admin login: own password + TOTP 2FA                             | ✅    | Admin never uses the shared passkey                                                               |
| Session timeout, "sign out everywhere", revoke a user's sessions | ✅    | Sessions table                                                                                    |
| Rotate shared passkey (signs everyone out)                       | ✅    | One click in Settings                                                                             |
| Optional email one-time code on a new device                     | ✅    | Resend 100/day limit is fine for a small team. Recommended because a shared passkey alone is weak |
| WebAuthn "passkeys" (fingerprint/Face ID) for admin              | ✅    | Optional later (note: different from your "common passkey")                                       |

### 5.2 Certificate upload and extraction (admin)

| Feature                                                                          | Free? | Notes                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload PDF, image (JPG/PNG/WebP/HEIC), or both for one certificate               | ✅    | Drag-drop, phone camera capture                                                                                                                            |
| File checks: real type by magic bytes, size limit, duplicate detection (SHA-256) | ✅    |                                                                                                                                                            |
| Image cleanup: auto-rotate, compress, optional "convert image to PDF"            | ✅    | In browser                                                                                                                                                 |
| Text from digital PDFs                                                           | ✅    | Accurate                                                                                                                                                   |
| OCR for scans                                                                    | ⚠️    | Tesseract.js in the admin's browser. Good on clean 300 dpi scans; weaker on stamps, handwriting, low-quality photos. Takes ~5 to 20 s per page             |
| Key fields auto-filled per type (number, holder, issuer, dates…)                 | ⚠️    | Rule-based using each type's anchors/regex. I will tune rules with your 5 sample certificates. **Admin always reviews and corrects before saving**         |
| Key points + summary                                                             | ⚠️    | Generated from extracted fields via each type's summary template (reliable, private). Free-form "AI-written" summaries only if you enable optional AI (§6) |
| Edit, replace file, soft delete, restore                                         | ✅    |                                                                                                                                                            |
| Bulk upload                                                                      | ⚠️    | Supported, but OCR runs one file at a time in the browser                                                                                                  |
| Server-side virus scanning                                                       | ❌    | No free option that keeps files private (VirusTotal shares uploads). Risk is low since only the admin uploads; we do strict type checks instead            |

### 5.2a Certificate types: your samples, and adding new types without code (added 2026-11-03)

**What the 4 samples are.** All 4 are gemstone lab reports, scanned on a Canon scanner at 300 dpi (A4, one page). The PDFs are only an image of the scan: their built-in text layer is unreliable (garbage on the two "Full" ones), so the app always runs its own OCR and never trusts the scanner's text.

| #   | Type (proposed name)                                         | Layout                                                                                                                                                                                                                 | Key fields to extract                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **AIGS Gemstone Identification Report** (Full)               | Folded booklet scanned sideways (needs 90° auto-rotate). Two halves: logo, QR "Verify with AIGS App", hologram, 2 gemologist signatures; then "Label : value" lines, comments, "Instruments Used" tick boxes, barcode. | Report No (e.g. GF26070746), Date, Weight (ct), Shape, Cut, Measurements (mm), Color, Origin, Identification (e.g. Natural Ruby), Comments (e.g. "No indication of heat treatment: NTE"), Instruments used (multi-select)  |
| 2   | **AIGS Analysis Short Report** (Normal)                      | Portrait letterhead, title "ANALYSIS SHORT REPORT: Identification Check", clean 2-column table. Unsigned, no photo. Easiest to OCR.                                                                                    | Report No (GLI26062280), Customer, Reference, Date of Submission, Description, Total weight (cts), Shape and cut, Quantity (pieces), Identification, Date of Issue                                                         |
| 3   | **Bellerophon Gemmological Report** (Full)                   | Folded booklet scanned sideways (needs auto-rotate). Dotted-leader "Label ........ value" list, 2 signatures, stone photo, colour/clarity scales, QR.                                                                  | Report No (B77215), Date, Description, Weight (ct), Measurements, Cut & Shape, Identification (e.g. Natural EMERALD), Color, Color Distribution, Color Stability, Clarity, Fluorescence, Comment, Provenance (origin), Age |
| 4   | **Bellerophon Gemmological Testing Results** (Normal, batch) | Portrait letterhead; header (date, gemstone count, Reference N° C01092), then a **table of several rows**, then methods + legal text.                                                                                  | Reference No, Date, Total gemstones; per row: Item No, Carat, Identification, Comment (treatment), Pieces; Tested for, Methods                                                                                             |

**What this means for the design**

- Types are really _lab + report kind_. Each type gets a `lab` value (AIGS, Bellerophon…) so staff can filter by lab across types.
- Gem reports have **no expiry date**, so expiry tracking becomes optional per type (off for these 4).
- Type 4 has a repeating table, so fields need a **"table" field kind** (a list of rows with their own columns), not only single values.
- Common search/sort across all types works through **core roles**: each type maps one of its fields to Report number, Report date, Customer, Gem/identification and Total weight. Type-specific fields stay in `certificates.data` (jsonb) and stay searchable.
- **Auto-detect type on upload**: each type stores a few "fingerprint" phrases (e.g. "ANALYSIS SHORT REPORT", "Gemmological Testing Results"). After OCR, the app suggests the best matching type; the admin can change it.
- 5th type: still waiting for your sample.

**How the admin adds a new type later (no code, no deploy)** — Admin → Certificate types → _New type_, a 4-step mobile-friendly wizard:

1. **Basics:** name, lab/issuer, short description, icon and colour, expiry tracking on/off (+ warning days).
2. **Fields:** add rows: label, kind (`text`, `long text`, `number`, `carat`, `date`, `select`, `multi-select`, `table`), required, show in list, filterable, core role (optional). Drag to reorder.
3. **Extraction hints (per field, all optional):** label words to look for (e.g. "Report No", "REPORT No."), value pattern (pick from presets like _report number_, _date_, _carat_, _mm size_, or a custom regex), and clean-up (trim, uppercase, parse date, number). Plus the type's fingerprint phrases and a summary template such as `{identification}, {weight} ct, {origin}. Report {report_no} dated {date}.`
4. **Test with a sample (optional but recommended):** upload one PDF/image; the app rotates, OCRs and shows each field green (found) or amber (missing), with the OCR text beside it so the admin can copy the right label words. Repeat until happy, then **Save**. The sample is kept privately as the type's reference.

Safety rules: a type with certificates can't be deleted, only archived (hidden from upload). Each save keeps a version so old certificates keep their data; removing a field hides it but never deletes stored values; a field's key can't change after use. Every change is in the audit log.

**Build split:** Phase 2 builds the types table, the wizard (steps 1, 2, and the hint _forms_ in 3), seeds the 4 types above, and upload with manual fields. Phase 3 builds the OCR engine (auto-rotate, image clean-up, Tesseract.js), the rule matcher, type auto-detect, table-row extraction and the "Test with a sample" screen, tuned on your 4 samples.

> ⚠️ **Model reminder:** Phase 3 (extraction pipeline) and the security parts of upload (file checks, private storage, signed URLs) are critical, complex work. **Switch to Opus before starting them.** The forms and CRUD in Phase 2 are fine on Sonnet 5.5.

### 5.3 Search, review, download (all permitted users)

| Feature                                                                                         | Free? | Notes                                                              |
| ----------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| Instant search (number, holder, issuer, any OCR text), typo-tolerant                            | ✅    | Postgres full-text + trigram                                       |
| Filters: type, status (valid/expiring/expired), issuer, date ranges, tags, type-specific fields | ✅    | Shareable URL filters                                              |
| Sort by any column; card view (mobile) and table view (desktop)                                 | ✅    |                                                                    |
| Detail page: key points, summary, all fields, thumbnails                                        | ✅    |                                                                    |
| In-browser preview: PDF viewer, image zoom/pan, side-by-side PDF + image                        | ✅    |                                                                    |
| Download PDF, image, or both (zip)                                                              | ✅    | Signed links expire in ~60 s                                       |
| Optional watermark on download ("Downloaded by name@… on date")                                 | ✅    | pdf-lib; deters leaks                                              |
| Expiry warnings (badge + optional email digest to admin)                                        | ✅    |                                                                    |
| Every view/download is logged                                                                   | ✅    | Visible to admin                                                   |
| Keyboard shortcuts, WCAG 2.2 AA                                                                 | ✅    | White background throughout (no dark theme, per brand requirement) |
| Installable app (PWA) on phones                                                                 | ✅    | Files are not cached offline, on purpose (sensitive)               |

### 5.4 Admin dashboard (full control)

| Feature                                                                                                                  | Free? |
| ------------------------------------------------------------------------------------------------------------------------ | ----- |
| Overview: totals by type/status, expiring soon, recent uploads, recent activity, storage/DB usage meters                 | ✅    |
| Users: add/disable/remove, per-user download permission, see sessions, force sign-out, activity history                  | ✅    |
| Certificates: everything above + bulk actions + export list to CSV                                                       | ✅    |
| Certificate types: create/edit fields, extraction rules, summary template, icon/colour, test rules against a sample file | ✅    |
| Settings: passkey rotation, session length, alert email, lockdown mode, AI on/off                                        | ✅    |
| Audit log viewer with filters and CSV export                                                                             | ✅    |
| Backup export (DB + files zip)                                                                                           | ✅    |

### 5.5 System Map page (live)

An interactive diagram of every part of the system and each connection between them:

`Browser/UI → Vercel Edge → Middleware (auth gate) → API routes → Postgres`, `→ Storage`, `→ Realtime`, `→ Email (Resend)`, `→ OCR (browser)`, `→ optional AI`, `cron-job.org → Health API`.

| Feature                                                                                                                                                                                             | Free? | Notes                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| Nodes and edges coloured green/amber/red with latency and last-OK time                                                                                                                              | ✅    | React Flow                                                                                                      |
| Click a connection to see what flows through it, with **redacted sample data** and a plain-English explanation (e.g. "API → Storage: request signed URL `{path: certs/…/a1b2.pdf, expiresIn: 60}`") | ✅    |                                                                                                                 |
| Real-time updates                                                                                                                                                                                   | ✅    | Supabase Realtime pushes new health results while the page is open (free: 200 concurrent connections)           |
| Background checks when nobody is watching                                                                                                                                                           | ⚠️    | Every 1 to 5 minutes via cron-job.org, not truly continuous                                                     |
| Failure highlighting: broken node/edge pulses red, root cause highlighted (e.g. DB down → everything after it shown as "affected", not "failed")                                                    | ✅    |                                                                                                                 |
| Critical banner + bell in dashboard                                                                                                                                                                 | ✅    |                                                                                                                 |
| Email alert to you                                                                                                                                                                                  | ✅    | Resend; de-duplicated (one email per incident, plus "resolved" email), daily cap respected                      |
| What it can't see                                                                                                                                                                                   | ⚠️    | If **Vercel itself** is down, the app can't report it. cron-job.org's own failure email covers that case (free) |
| **One-click "Diagnose & Fix"**                                                                                                                                                                      | ⚠️    | See below                                                                                                       |

**What "Diagnose & Fix" really does (honest scope):**
It runs a fixed checklist for the failing part, applies only **safe, pre-approved remediations**, re-tests, and writes a report.

- **Checks:** env variables present, DB reachable + query latency, RLS still on, storage bucket reachable + private, signed URL round-trip, email provider reachable, Realtime connection, extraction failures queue, quota usage (DB/storage/email), SSL/headers, recent error spikes, Supabase paused?
- **Safe automatic fixes:** retry with backoff, warm/reconnect DB, clear app caches (revalidate), regenerate thumbnails, re-run failed extractions, re-send queued emails, purge expired sessions, unblock self-locked admin IP, trigger a Vercel redeploy via Deploy Hook.
- **Cannot auto-fix (report tells you exactly what to do, with links):** bugs in code, provider outages, a paused Supabase project (one click in Supabase), exceeded free quotas, wrong/expired secrets, plan limits.
- **Report:** what failed, every check run with result, what was changed, final status, time taken; saved to `incidents`, viewable and downloadable.

### 5.6 Security Monitor page

Shown the same way as the System Map: a live view with severity colours, a feed, and one-click responses.

**Defenses (always on):**

| Defense                                                                                                | Free?                        |
| ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| HTTPS/TLS, platform DDoS mitigation, Attack Challenge Mode toggle                                      | ✅ (Vercel, all plans)       |
| Strict security headers: CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy               | ✅                           |
| Rate limits on login, search and download; progressive lockout after failed passkey/password attempts  | ✅                           |
| IP blocklist (manual + automatic temporary blocks)                                                     | ✅                           |
| CSRF protection (SameSite cookies + origin check), zod validation on all inputs, parameterised queries | ✅                           |
| Private storage, 60 s signed URLs, RLS deny-all, server-only secrets                                   | ✅                           |
| Lockdown mode (only admin can sign in) and "sign out everyone"                                         | ✅                           |
| Dependency vulnerability alerts (Dependabot)                                                           | ✅ (GitHub)                  |
| CodeQL code scanning                                                                                   | ⚠️ Free only on public repos |

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

### 5.7 Control Center page (manual kill switches) — approved 2026-10-31

A separate admin page for switching the whole system, or one part of it, off and on by hand. It complements the System Map (§5.5): the map _watches_ health on its own, the Control Center lets the admin _act_. Both use the same map design.

**Access**

- Only the admin. Opening the page needs a **second passkey** (the "Control passkey"), separate from the admin password, the TOTP code and the staff passkey. It is set on first visit and stored as an Argon2id hash.
- A correct Control passkey unlocks the page for **10 minutes** (step-up session). Wrong tries count toward lockout and raise a `security_events` alert.
- **The admin dashboard is never switched off**, so the admin can always undo a switch. Admin routes skip the switch check entirely.

**The map**

- A React Flow diagram. In the middle is the big round **System Down / Hold** button for the whole staff side.
- Around it are the sections, joined by lines that show how they depend on each other: **Sign-in (Authentication)**, **Database**, **File storage**, **Search**, **Certificate view**, **Downloads**, **Uploads**, **Email**, **Extraction/OCR**, **Health checks**, **Public pages**.
- Each section node has its own buttons, and each line can be cut on its own. For example: hold the Database but keep Sign-in on, hold Sign-in but keep the rest, or both.
- Colours with icon + text (never colour alone): green **On**, blue **Read-only**, amber **Hold**, red **Down**, grey **Affected** (on, but blocked because a section it depends on is off; e.g. Database down → Search, View and Downloads shown as affected).
- Works on phones: the map becomes a vertical list of the same sections with the same buttons (§1b).

**Approved features (all 10, all free)**

| #   | Feature                      | What it does                                                                                                                                                                                                                                                     |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hold vs Down**             | _Hold_: users see a friendly "temporarily on hold, back soon" page; nothing is lost and sessions stay. _Down_: the section is fully off, its requests are refused, and for Sign-in all staff sessions are ended.                                                 |
| 2   | **Message + timer**          | Write the message users see. Set an automatic "back on at" time; the switch turns itself back on when the time passes (checked on each request, so no extra service is needed).                                                                                  |
| 3   | **Confirm big actions**      | The full-system switch and any _Down_ need the Control passkey again plus typing the word `CONFIRM`. A 5-second "undo" toast follows every switch.                                                                                                               |
| 4   | **Change log**               | Every switch saves who, when, which section, old → new state, the reason (required field) and the IP, in `audit_logs`; shown as a timeline on the page and downloadable as CSV.                                                                                  |
| 5   | **Email alerts**             | An email to the admin address on every change, and when a timer or schedule turns something back on.                                                                                                                                                             |
| 6   | **Emergency switch-on link** | A "Send rescue link" button (also sent automatically after 3 wrong Control passkey tries in a row) emails a signed, single-use link valid for 15 minutes. Opening it, after admin sign-in, turns **everything back on** and asks to set a new Control passkey.   |
| 7   | **Read-only mode**           | Staff can still sign in, search and view, but downloads (and admin uploads, if chosen) are off. Can be set for the whole system or per section.                                                                                                                  |
| 8   | **Schedules**                | Per-section maintenance windows, one-off or repeating (e.g. "hold Uploads every night 00:00–02:00 Asia/Colombo"). Evaluated on each request; an upcoming-window banner is shown to staff 15 minutes before.                                                      |
| 9   | **Auto-protect**             | Optional (off by default, admin chooses): when the Security Monitor (§5.6) sees a large attack, e.g. a brute-force spike, the system automatically puts **Sign-in on Hold** for a set time, emails the admin, and logs it. Built in Phase 7 with the detections. |
| 10  | **Group / type switches**    | Hold or turn off access for **selected users**, a **user group**, or **one certificate type**, without stopping everyone. Uses the same states and timers.                                                                                                       |

**Extra features added with this page**

- **Presets**: one-click saved setups such as "Maintenance" (Uploads + Extraction on Hold), "Read-only day", "Lock everything".
- **Status preview**: "View as staff" shows exactly what a staff user sees right now.
- **Live sync**: if the admin has the page open on two devices, both update instantly (Supabase Realtime).
- **Public status note**: the sign-in page shows the current hold message, so staff know before they try to sign in.

**How it works (honest scope)**

- Switch states are rows in the database. `proxy.ts` and server actions check them on every staff request, with a short in-memory cache (about 10 seconds) so the check is fast. Admin routes are exempt.
- "Database down" means **the app stops using the database for staff features**. It does not pause the Supabase project itself (that can only be done in Supabase). If the database is genuinely unreachable, the switch state falls back to the last cached value, and the admin pages still load and show a clear error.
- Switching sections off cannot stop Vercel itself. A full outage of Vercel or Supabase is outside the app's control.

---

### 5.8 Review updates from Shehan, 2026-11-05 (#1–#5 done in Phase 3b, #6 in Phase 3c; #7 planned)

**1. Real logos.**

- Logo files are in `C:\Users\Orava_Dell_G5\OneDrive\Documents\GitHub\orava_certificate_web_infromations`, and you renamed them. When your laptop is on, I copy them into `public/brand/` and generate the favicon and app icons from them.
- The Orava logo goes in the header, the sign-in pages, the footer and the PDF reports.
- Each lab logo (AIGS, Bellerophon, and later labs) is stored on the lab's record. It is shown on certificate cards, on the detail page, in filters and in reports.
- The admin can upload or replace a lab logo in the app (PNG/JPG/SVG/WebP, max 1 MB, checked on the server).

**2. Labs, and the new type names.**

- A new **Labs** list: name, short name, logo, website. Each certificate type belongs to one lab and one category.
- There are two categories:
  - **Individual Gem Stone Report** (was "Full")
  - **Lot Wise Gem Stones Report** (was "Normal")
- The type name is built from these, lab first, e.g. "AIGS Individual Gem Stone Report" and "Bellerophon Lot Wise Gem Stones Report". The 4 existing types are renamed by a migration. Their fields, hints and saved certificates stay as they are.
- In the wizard, step 1 becomes: pick or add the lab (with logo upload), pick the category, and the name fills in. The admin can still edit the name.

**3. File names: `ReportNo_Date_Lab.pdf`.**

- Every stored file is named `<report number>_<report date YYYY-MM-DD>_<lab short name>.<ext>`, e.g. `B77215_2026-09-17_Bellerophon.pdf` or `GF26070746_2026-07-15_AIGS.pdf`.
- This applies to the name in storage, the name staff get when they download, and the files inside zip downloads.
- The name is built from the saved fields, not the uploaded file name. Characters not allowed in file names are removed.
- Names that are still missing:
  - If the report number or date is missing, that part becomes `NoReportNo` or `NoDate` and the certificate is marked "Check".
  - When the admin fixes the field, the file is renamed automatically.
- Lot reports with more than one page or file get `_2`, `_3`.
- A one-time job renames the files already uploaded.

**4. PDF and images.** Built as recommended on the 2026-11-05 decision card: PDF is the main format, and phone photos and scans are still accepted. The browser turns each image into a one-page PDF before upload (hand-written PDF, no extra library). Every stored certificate is then one PDF with the standard name. The original image is not kept. To switch this off, set `STORE_AS_PDF` in `src/lib/files/rules.ts`.

**5. Duplicates: Replace or Skip only.** There is no second copy any more.

- The database refuses a second live certificate with the same lab + report number (unique index).
- When a duplicate is found, the screen shows both side by side (fields and preview) with two choices:
  - **Skip** keeps the old one and drops the new file.
  - **Replace** puts the new fields and file in place of the old one.
- The replaced version moves to the certificate's **Earlier versions**, and only the admin can bring it back. The automatic delete after 30 days comes with Trash in Phase 5.
- Every Replace and Skip is in the audit log.
- In a batch, "Apply to all remaining duplicates" saves clicks.

**6. Three kinds of people: permissions.**

|                                                                                        | Staff (permitted)                         | Uploader (special staff)                                       | Admin                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Sign in                                                                                | Email + shared passkey + email code       | Same, plus a **personal upload passkey** to unlock upload mode | Password + authenticator                  |
| Search, filter, sort, view, preview                                                    | ✅                                        | ✅                                                             | ✅                                        |
| Download                                                                               | ✅ if the admin allows it for that person | ✅                                                             | ✅                                        |
| Reports (filtered/sorted lists → PDF/Excel/CSV/print)                                  | ✅ if the admin allows it for that person | ✅                                                             | ✅                                        |
| Upload ("Add from files"), Replace, Skip                                               | ❌                                        | ✅ while upload mode is unlocked (30 min, then asks again)     | ✅                                        |
| Delete a certificate                                                                   | ❌                                        | ✅ moves it to Trash (30 days)                                 | ✅, including restore and delete for good |
| Edit fields / fix "Check" marks                                                        | ❌                                        | ✅                                                             | ✅                                        |
| Certificate types, labs, logos, users, settings, audit log, System Map, Control Center | ❌                                        | ❌                                                             | ✅ only                                   |

- The admin switches each power on or off **per person** in Users: Download, Reports and **Uploader**. Turning Uploader off works at once (the upload mode ends on the next click).
- Uploader passkey:
  - Each uploader has their own passkey, not a shared one, so every upload is traced to one person and one uploader can be stopped without affecting the other.
  - The admin creates it once and can reset it.
  - Five wrong tries locks upload mode and emails the admin.
- Power is always checked on the server for every action, never only by hiding buttons.

**7. More filters, sorting and reports** (adds to §5.3).

- Filters:
  - lab, category, type, report date range, upload date range, report number
  - identification / gem (e.g. Ruby, Emerald), natural / synthetic, colour, origin / provenance
  - weight range (ct), shape / cut, treatment / comment words (e.g. "no heat", "oil")
  - customer, number of stones (lot), uploaded by, "needs check", has file / no file
- Sort by any column, plus a second sort key (e.g. lab, then date).
- Saved views:
  - A filter + sort + columns combination can be saved with a name, like "Emeralds this month".
  - It can be shared with all staff, or kept private.
- **Report builder:**
  - Pick the columns (drag to reorder) and group by lab / type / gem / origin / month, with counts and total carats per group and a grand total.
  - Output: PDF with the Orava logo, the date and who made it, or Excel (.xlsx), CSV, or print. The page layout follows the screen size on phones.
  - Shareable link to the same view.
  - Every report export is logged.
- Phones show cards with a filter drawer; laptops show a table with a side filter panel. Everything is tested on the §1b matrix.

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
│  ├─ admin/ overview, users, certificates, types, upload, audit, system-map, control-center, security, settings
│  └─ api/ auth, certificates, files, health, diagnose, security, backup
├─ components/ (ui/, certificates/, admin/, system-map/, control-center/, security/)
├─ lib/ (auth, db, storage, extraction/, health/, switches/, security/, email)
├─ supabase/migrations/ (SQL schema, RLS, seed of 5 types)
├─ tests/ (unit, e2e)
├─ .github/ (dependabot.yml, workflows/)
├─ proxy.ts
├─ README.md · .gitignore · .gitattributes · .env.example · LICENSE (private)
```

---

## 9. Build phases

| #                                    | Phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Outcome you can check                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 0                                    | Scaffold: Next.js, Tailwind, shadcn, lint/format, README, .gitignore, .gitattributes, .env.example                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Runs locally; you commit + push; first Vercel deploy                                                                                           |
| 1                                    | Supabase schema + RLS + auth (allowlist, passkey, admin password + TOTP, sessions)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | You and a test user can sign in                                                                                                                |
| 2a _(done 2026-11-03, v0.3.0)_       | Certificate types: tables, 4 sample types added, 4-step wizard (create/edit/archive, versions), add/edit/delete certificates with manual fields incl. table rows, summary + key points from the type's template                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Admin creates a test type in the wizard and adds a certificate                                                                                 |
| 2b _(done 2026-11-03, v0.4.0, Opus)_ | File upload: private bucket, direct browser upload with one-time links, server re-checks real file type, PDF scripts/attachments/encryption, size, duplicates; 60-second view/download links; audit log. Thumbnails moved to Phase 4 (preview)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Admin attaches a scan to a certificate                                                                                                         |
| 2 (original wording)                 | Certificate types (wizard UI per §5.2a, seed the 4 sample types) + upload (direct to storage) + manual fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Admin creates a test type in the wizard and uploads a certificate                                                                              |
| 3 _(done 2026-11-03, v0.5.0, Opus)_  | Automatic reading: "Add from files" (many at once). In the admin's browser: PDF pages drawn with pdf.js, auto-rotate, scan clean-up (table borders, dotted leaders, barcodes, dust removed), Tesseract.js OCR; type found by fingerprints + labels; fields filled from per-type hints (labels, patterns, tick boxes, tables); second lighter reading when a required field is unclear; clear ones saved automatically with the file, unclear fields marked "Check"; duplicate report numbers caught; OCR text kept for Phase 4 search. "Test with a sample" in the type editor. Tuned on the 4 samples: right type and all key fields on all 8 sample files (JPG + PDF), ~7 s each                                                                                                                                                                                                                                                       | Auto-filled fields on your real examples                                                                                                       |
| 3b _(done 2026-11-10, v0.6.0, Opus)_ | Review updates §5.8 #1–#5: real Orava logo + Labs list with logos, type names → "Individual Gem Stone Report / Lot Wise Gem Stones Report: <Lab>", file names `ReportNo_Date_Lab`, rename existing files, images turned into PDF before upload, duplicates → Replace / Skip with 30-day history                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Upload the same report twice and choose Replace; the stored and downloaded file is named `B77215_2026-09-17_Bellerophon.pdf`                   |
| 3c _(done 2026-11-10, v0.7.0, Opus)_ | Permissions §5.8 #6: Staff / Uploader / Admin, per-person switches for Download, Reports and Uploader, personal upload passkey (shown once, 5 wrong tries lock it and email the admin) with 30-min upload mode at /upload, server-side checks on every action and every admin page. Deleted certificates are kept (soft delete); the Trash page to restore them moves to Phase 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Admin turns Uploader on for one staff member; they unlock upload mode and add a certificate; admin turns it off and the next upload is refused |
| 4 _(done 2026-11-10, v0.8.0)_        | Search (every word, across main fields, type values and the text read from the file), filters (lab, kind of report, type, stone, origin, date range, carat range) with removable chips, two-level sort, pages of 25, all in the address so lists can be bookmarked; staff certificate page with details, Open PDF and Download (only with the Download permission, checked again on the server), every view/download logged; same search on the admin and upload lists. Live updates (v0.8.1): open staff and admin pages check `/api/live` every 15 s while visible and on focus, and reload their data when anything changes; a signed-out or disabled person is sent to sign-in. Still to do here or in 5: zip download of several files, watermark on downloads, saved views                                                                                                                                                         | Users find and download in seconds                                                                                                             |
| 4b _(done 2026-11-10, v0.9.0)_       | Report builder at /reports (staff with Reports on) and /admin/reports: same filters and sort as search, pick columns, group by lab / type / kind / stone / origin / month with counts and total carats, on-screen preview (300 rows) and print view, downloads as PDF (Orava logo, A4 landscape, pdf-lib), Excel .xlsx (built in-house) and CSV (safe against formula injection) up to 5000 rows; every export logged as report.export. Shareable via the page address.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Staff with Reports on make "Emeralds by origin this month" and download it as PDF and Excel                                                    |
| 5 _(done 2026-11-10, v0.10.0)_       | Trash at /admin/trash: deleted certificates (by the admin or an uploader) are kept 30 days with their files, with who deleted them and days left; Restore (refused while another live certificate has the same report number), Delete for good, Empty Trash. Everything deleted over 30 days ago (Trash and earlier versions kept by Replace) is erased when the Trash opens and by a daily Vercel Cron (/api/cron/daily with CRON_SECRET). Activity log at /admin/activity: search, person, kind and date filters, 50 per page, details per entry, CSV download (logged), linked from Staff and the Overview. Backup at /admin/backup: one zip made in the admin's browser (database tables as JSON, every file straight from storage, manifest, README; secrets left out), Database-only option, last backup shown, Overview alert and weekly email reminder when none in 7 days. Admin phone tab bar gets a More menu. Migration 0007 | Admin deletes a certificate, restores it from the Trash, finds both in the Activity log, and downloads a backup zip that holds it              |
| 6                                    | System Map: health probes, React Flow map, Realtime, incidents, email alerts, Diagnose & Fix + reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Break something on purpose, watch it go red, get email, fix it                                                                                 |
| 6b                                   | Control Center (§5.7): Control passkey, switch map with system and section buttons, Hold/Down/Read-only, messages and timers, confirm + undo, change log, email alerts, rescue link, schedules, group/type switches, presets, staff preview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Hold the Database from the map, see staff get the hold page while the admin dashboard keeps working, then switch it back on                    |
| 7                                    | Security Monitor: detections, defenses, page, actions, alerts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Simulated brute force gets detected and blocked; with Auto-protect on, Sign-in goes on Hold by itself (§5.7 #9)                                |
| 8                                    | Hardening: full responsive matrix review, accessibility audit, performance, docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for daily use                                                                                                                            |

The responsive test matrix (§1b) is set up in Phase 0 and runs from the first page onward, so every component is checked on phone sizes as it is built.

Each phase ends with a short "what changed" note so you can review and commit in GitHub Desktop.

---

## 10. Accounts you'll need (all free)

1. GitHub (shehannirmana2000job@gmail.com): new **private** repo `orava-certificate-store` (create it from GitHub Desktop: _File → Add local repository_ on this folder, then _Publish_)
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
5. **Names of the 5 certificate types** and one sample of each, when ready. _(4 received 2026-11-03, see §5.2a; 5th pending.)_

---

## 12. Which Claude model to use per phase (token saving)

Use **Sonnet** for routine building and **Opus** where a mistake would be costly (security, auth, tricky logic). Switch the model before starting each phase. Starting each phase in a fresh thread also saves tokens, because `CLAUDE.md` and this plan carry the context.

| Phase                                             | Model                                              | Why                                                                                                |
| ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0 Setup, branding, test matrix                    | Sonnet                                             | Standard scaffolding _(already done)_                                                              |
| 1 Database, sign-in, sessions, admin 2FA          | **Opus**                                           | Security-critical: passkey hashing, sessions, rate limits, RLS                                     |
| 2 Certificate types + upload                      | Sonnet, **Opus** for upload security               | Wizard forms and CRUD on Sonnet; file checks, private storage and signed URLs on Opus              |
| 3 Extraction (PDF text, OCR, rules, summary)      | **Opus**                                           | Hardest logic; accuracy matters                                                                    |
| 3b Logos, labs, renames, file names, Replace/Skip | Sonnet, **Opus** for the rename job + unique index | Mostly UI; the bulk file rename and duplicate rule touch stored data                               |
| 3c Staff / Uploader / Admin permissions           | **Opus**                                           | Security-critical: who can upload or delete, second passkey, server checks                         |
| 4 Search, filters, preview, downloads             | Sonnet                                             | UI and queries (use Opus only for search ranking tuning if needed)                                 |
| 4b Report builder                                 | Sonnet                                             | UI and exports                                                                                     |
| 5 Admin dashboard                                 | Sonnet                                             | Mostly UI pages                                                                                    |
| 6 System Map, alerts, Diagnose & Fix              | **Opus**                                           | Health checks, failure detection and safe auto-fix logic                                           |
| 6b Control Center (kill switches)                 | **Opus**                                           | It can lock everyone out: the switch checks, admin exemption and rescue link must be exactly right |
| 7 Security Monitor                                | **Opus**                                           | Attack detection and defenses                                                                      |
| 8 Hardening                                       | Sonnet, then **Opus**                              | Sonnet for tests, docs and responsive fixes; Opus for one final security review                    |

Small fixes, copy changes, README edits and new pages in an existing pattern: always Sonnet.
