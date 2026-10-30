# Orava Certificate Store: rules for AI assistants

Read `PLAN.md` for the full plan. Read `AGENTS.md` for Next.js 16 notes (APIs differ from older versions).

## Hard rules

- **Free technologies only.** Never add a paid service, paid plan or paid API key.
- **Latest stable versions only** (npm `latest` tag, no beta/rc/canary). Pin exact versions.
- **Responsive on every device** from 320 px up. Add every new page to `tests/e2e/pages.ts`; `pnpm test:e2e` must pass.
- **White background** on every page. No dark theme.
- Touch targets at least 44 × 44 px; inputs at least 16 px font; WCAG 2.2 AA.
- Footer: `© 2026 orava (Pvt) Ltd.`, `Developed by Shehan Nirmana`, app version.
- Certificates are sensitive: the browser never gets database or storage keys; files are served through short-lived signed URLs; every view/download is logged.
- **Do not commit or push.** The owner commits manually with GitHub Desktop.

## Conventions

- Next.js 16 App Router, `src/` layout, `@/*` alias. Request interception lives in `src/proxy.ts` (not middleware).
- UI components in `src/components/ui` follow shadcn/ui style (`cn()`, `cva`). The shadcn registry may be unreachable from some sandboxes; write components by hand in the same style.
- TypeScript 7 for `pnpm typecheck`; `typescript` resolves to the TS 6 API package for ESLint/Next.
- Before finishing: `pnpm check`, `pnpm build`, `pnpm test:e2e`.
