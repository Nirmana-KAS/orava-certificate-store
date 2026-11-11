// Test-only accounts and secrets for the local end-to-end database. Never used in production.
import { join } from "node:path";

export const E2E = {
  dbPort: 54329,
  storagePort: 54330,
  storageKey: "e2e-storage-secret-key-0123456789",
  appPort: Number(process.env.E2E_PORT ?? 3100),
  authSecret: "e2e-only-secret-0123456789abcdefghijklmnopqrstuvwxyz",
  setupToken: "e2e-setup-token-0123456789",
  admin: {
    email: "admin@example.com",
    password: "Admin-Password-2026!",
    totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  },
  staff: { email: "staff@example.com", name: "Test Staff" },
  uploader: { email: "uploader@example.com", uploadPasskey: "K7QM-3XPA-W9RT-HC2D" },
  disabled: { email: "former@example.com" },
  passkey: "Shared-Passkey-2026",
  mailFile: join(import.meta.dirname, "..", "..", "test-results", "mail.jsonl"),
  authDir: join(import.meta.dirname, "..", "..", "test-results", ".auth"),
} as const;

export const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${E2E.dbPort}/postgres`;

export const appEnv = {
  DATABASE_URL: databaseUrl,
  // PGlite runs one query at a time; a single connection keeps statements from interleaving
  DATABASE_POOL_MAX: "1",
  AUTH_SECRET: E2E.authSecret,
  ADMIN_EMAIL: E2E.admin.email,
  ADMIN_SETUP_TOKEN: E2E.setupToken,
  MAIL_FILE: E2E.mailFile,
  SUPABASE_URL: `http://127.0.0.1:${E2E.storagePort}`,
  SUPABASE_SERVICE_ROLE_KEY: E2E.storageKey,
  CRON_SECRET: "e2e-cron-secret-0123456789",
};
