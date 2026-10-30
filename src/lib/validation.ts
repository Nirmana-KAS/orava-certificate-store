import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

export const PASSKEY_MIN = 10;
export const ADMIN_PASSWORD_MIN = 12;

export const passkeySchema = z
  .string()
  .min(PASSKEY_MIN, { error: `The passkey must be at least ${PASSKEY_MIN} characters.` })
  .max(200);

export const adminPasswordSchema = z
  .string()
  .min(ADMIN_PASSWORD_MIN, { error: `Use at least ${ADMIN_PASSWORD_MIN} characters.` })
  .max(200);

export const sixDigitCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: "Enter the 6-digit code." });

export const signInSchema = z.object({
  email: emailSchema,
  passkey: z.string().min(1, { error: "Enter the passkey." }).max(200),
});

export const adminSignInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }).max(200),
});

export const newUserSchema = z.object({
  email: emailSchema,
  name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  canDownload: z.boolean(),
});

/** First error message per field, for showing under inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export type FormState = {
  error?: string;
  fields?: Record<string, string>;
  success?: string;
  /** Echo of non-secret inputs so the form keeps them after an error */
  values?: Record<string, string>;
} | null;
