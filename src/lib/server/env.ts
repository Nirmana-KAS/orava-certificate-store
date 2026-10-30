import "server-only";

import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ADMIN_EMAIL: z.email().transform((v) => v.toLowerCase()),
  ADMIN_SETUP_TOKEN: z.string().min(16).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),

  // Email: Gmail SMTP (sends to anyone, free) or Resend (free, sends only to your own address
  // until you verify a domain). In development with neither set, emails print to the console.
  SMTP_USER: z.string().optional(),
  SMTP_APP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
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
