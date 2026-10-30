<p align="center">
  <img src="public/brand/orava-logo.png" alt="orava (Pvt) Ltd." width="280" />
</p>

<h1 align="center">Orava Certificate Store</h1>

<p align="center">
  A secure, mobile-first web app where permitted orava staff search, review and download company certificates in seconds.
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16.4-000000?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19.3-149eca?logo=react" />
  <img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7.0-3178c6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind_CSS-4.3-38bdf8?logo=tailwindcss&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-free_tier-3ecf8e?logo=supabase&logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel" />
  <img alt="Version" src="https://img.shields.io/badge/version-0.2.0-3a75b1" />
</p>

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Responsive testing](#responsive-testing)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Security](#security)
- [Credits and licence](#credits-and-licence)

## Features

| For permitted staff                          | For the admin                                                |
| -------------------------------------------- | ------------------------------------------------------------ |
| Sign in with company email + shared passkey  | Upload PDF and/or scanned image per certificate              |
| Instant search, filters and sorting          | Automatic key points + summary on upload                     |
| Key points and summary for every certificate | Configurable certificate types (add more any time)           |
| In-browser PDF and image preview             | Full user and certificate control                            |
| Download PDF, image, or both                 | Live **System Map** with alerts and one-click Diagnose & Fix |
| Works on every phone, tablet and desktop     | **Security Monitor** for attacks and defenses                |

See [`PLAN.md`](PLAN.md) for the full plan, including what is and is not possible on free tiers.

## Tech stack

Free technologies only, each on its **latest stable** version (pinned exactly, kept current by Dependabot).

| Layer     | Technology                                                                |
| --------- | ------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript 7                           |
| UI        | Tailwind CSS 4, shadcn/ui components (Radix UI), lucide icons, Geist font |
| Data      | Supabase Postgres, Storage and Realtime (free tier)                       |
| Testing   | Vitest (unit), Playwright + axe-core (responsive and accessibility)       |
| Quality   | ESLint 10, Prettier 3, EditorConfig, GitHub Actions CI                    |
| Hosting   | Vercel (Hobby)                                                            |

> **TypeScript note:** TypeScript 7 (the native compiler) runs `pnpm typecheck`. Tools that still need the
> TypeScript 6 API (ESLint, Next.js build checks) use `@typescript/typescript6` under the `typescript`
> name, as Microsoft recommends for running both side by side.

## Getting started

**Requirements:** Node.js 26 LTS (see `.nvmrc`; 22.12+ works) and pnpm 12.

```bash
# 1. Enable pnpm (ships with Node.js)
corepack enable

# 2. Install dependencies
pnpm install

# 3. Create your local environment file
cp .env.example .env.local      # Windows PowerShell: Copy-Item .env.example .env.local

# 4. Fill in .env.local (see "First-time setup" below), then create the tables
pnpm db:migrate

# 5. Start the dev server
pnpm dev
```

Open <http://localhost:3000>. Without email settings, sign-in codes print in the terminal during development.

## First-time setup

Do this once. Everything is free.

1. **Supabase:** create a free project at <https://supabase.com> (region: Singapore). Choose a strong
   database password. Then _Connect → Transaction pooler_ and copy the connection string into
   `DATABASE_URL` (replace `[YOUR-PASSWORD]`).
2. **Secrets:** generate `AUTH_SECRET` and `ADMIN_SETUP_TOKEN`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Run it twice, one value for each.
3. **Email codes:** in your Google account turn on 2-Step Verification, create an
   [App password](https://myaccount.google.com/apppasswords), and put it in `SMTP_APP_PASSWORD`.
4. **Tables:** `pnpm db:migrate` (or paste `supabase/migrations/*.sql` into the Supabase SQL editor, in order).
5. **Vercel:** add every variable from `.env.local` under _Project → Settings → Environment Variables_,
   then redeploy.
6. **Admin account:** open `/admin/setup` on the site, enter the setup token, choose your admin
   password and the shared staff passkey, and scan the QR code with an authenticator app
   (Google or Microsoft Authenticator). The page closes for good after this.
7. **Staff:** in _Admin → Staff_, add each permitted email. Give them the shared passkey.

### How sign-in works

| Who   | Steps                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff | Email (must be on the list) + shared passkey. On a new device, also a 6-digit code sent to their email. The device is remembered for 30 days. |
| Admin | `/admin/login`: email + admin password, then a code from the authenticator app. Admin sessions last 8 hours.                                  |

Protection built in: 5 wrong tries lock an email for 15 minutes (10 in an hour lock it for an hour),
noisy IPs are slowed down and blocked for 24 hours after 50 failures, every sign-in and admin action
is logged, and the admin can change the passkey (signs all staff out) or turn on lockdown.

## Scripts

| Command                             | What it does                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`                          | Start the development server                                                   |
| `pnpm build` / `pnpm start`         | Production build / serve it                                                    |
| `pnpm lint`                         | ESLint                                                                         |
| `pnpm typecheck`                    | TypeScript 7 type check                                                        |
| `pnpm format` / `pnpm format:check` | Prettier (with Tailwind class sorting)                                         |
| `pnpm test`                         | Unit tests (Vitest)                                                            |
| `pnpm test:e2e`                     | Responsive + accessibility tests on 13 screen sizes (needs `pnpm build` first) |
| `pnpm test:e2e:all`                 | Same, plus Safari (WebKit) and Firefox                                         |
| `pnpm check`                        | Lint, typecheck, format check and unit tests in one go                         |

## Responsive testing

The end-to-end tests start their own throwaway Postgres (PGlite, in memory) with test accounts, so they
never touch your real database. Sign-in flows (wrong passkey, email codes, admin 2FA, lockdown,
passkey change and more) are tested in `tests/e2e/auth.spec.ts`.

Responsiveness is a hard requirement. Every page listed in `tests/e2e/pages.ts` is checked, signed in
where needed, at
**13 sizes**, from a 320 px phone to a 1920 px desktop, including landscape:

- no horizontal scrolling and nothing sticking out past the screen edge
- every button, field and link at least 44 × 44 px
- WCAG 2.2 AA accessibility checks (axe-core)
- white background
- a full-page screenshot for review

```bash
pnpm exec playwright install chromium   # first time only
pnpm build
pnpm test:e2e                           # screenshots land in test-results/
```

## Project structure

```text
src/
  app/                 Routes: sign-in, /verify, /certificates, /admin/*
  components/
    admin/             Admin navigation and forms
    auth/              Sign-in, code and setup forms
    forms/             Field, password input, submit button
    layout/            Header, footer, skip link
    ui/                shadcn/ui-style components
  lib/
    auth/, admin/      Server actions
    server/            Database, sessions, rate limits, email, audit (server only)
  proxy.ts             Per-request Content-Security-Policy and sign-in gate
supabase/migrations/   SQL schema with deny-all Row Level Security
scripts/db-migrate.ts  Migration runner
public/
  brand/               orava logo
  icons/               PWA icons
tests/
  e2e/                 Playwright responsive + accessibility tests
  unit/                Vitest unit tests
PLAN.md                Full build plan
```

## Deployment

1. In **GitHub Desktop**: _File → Add local repository_ → choose this folder → _Create repository_ if asked →
   **Publish repository** (keep _private_ ticked).
2. In **Vercel** (signed in with the same GitHub account): _Add New → Project_ → import
   `orava-certificate-store` → Framework _Next.js_ → **Deploy**.
3. In Vercel _Project → Settings → Build and Deployment_, choose the newest **Node.js** version offered.
4. Add environment variables from `.env.example` as each phase needs them.

Every push from GitHub Desktop to `main` deploys automatically.

## Roadmap

- [x] **Phase 0** Project setup, branding, responsive test matrix
- [x] **Phase 1** Database, sign-in (email + passkey), admin login with 2FA
- [ ] **Phase 2** Certificate types and upload
- [ ] **Phase 3** Key point and summary extraction
- [ ] **Phase 4** Search, filters, preview and downloads
- [ ] **Phase 5** Admin dashboard
- [ ] **Phase 6** System Map, alerts, Diagnose & Fix
- [ ] **Phase 7** Security Monitor
- [ ] **Phase 8** Final hardening

## Security

- Never commit `.env*` files or real certificates (`/samples` and `/private` are git-ignored).
- The app sends strict security headers (nonce-based CSP, HSTS, no framing) and is hidden from search engines.
- The browser never receives database keys. Every table has Row Level Security switched on with no
  public access.
- Passkey, passwords and codes are stored only as Argon2id or keyed hashes; the authenticator secret is
  encrypted (AES-256-GCM).
- Report security issues privately to the admin, not in public issues.

## Credits and licence

**Developer:** Shehan Nirmana  
**Company:** orava (Pvt) Ltd.  
**Version:** 0.2.0

© 2026 orava (Pvt) Ltd. All rights reserved. Proprietary and confidential; see [`LICENSE`](LICENSE).
