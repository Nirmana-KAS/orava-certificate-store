import "server-only";

import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ADMIN_EMAIL: z.email().transform((v) => v.toLowerCase()),
  ADMIN_SETUP_TOKEN: z.string().min(16).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),

  // File storage: Supabase Storage, used only from the server with the secret key
  SUPABASE_URL: z
    .url()
    .refine(
      (u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u),
      "SUPABASE_URL must start with https://",
    )
    // Only the project address counts: a pasted ".../rest/v1/" (the Data API URL) would send
    // storage calls to the database API instead, which answers "Invalid path" (PGRST125)
    .transform((u) => new URL(u).origin)
    .optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

  // Email: Gmail SMTP (sends to anyone, free) or Resend (free, sends only to your own address
  // until you verify a domain). In development with neither set, emails print to the console.
  SMTP_USER: z.string().optional(),
  SMTP_APP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Scheduled jobs (/api/cron/daily): Vercel Cron sends it as "Authorization: Bearer …",
  // cron-job.org in the x-cron-secret header
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters").optional(),
  // Turns a shared device location into a street address with OpenStreetMap's free Nominatim
  // service (on unless set to "off"; the tests turn it off)
  REVERSE_GEOCODE: z.enum(["on", "off"]).optional(),
  // Optional: a Vercel Deploy Hook (Project → Settings → Git → Deploy Hooks), so the System Map
  // can start a fresh deployment with one button
  DEPLOY_HOOK_URL: z
    .url()
    .refine(
      (u) => u.startsWith("https://api.vercel.com/"),
      "DEPLOY_HOOK_URL must be a Vercel Deploy Hook",
    )
    .optional(),
  // Test-only: write emails to a JSON file instead of sending (refused on Vercel)
  MAIL_FILE: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment. ${issues}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = process.env.NODE_ENV === "production";
