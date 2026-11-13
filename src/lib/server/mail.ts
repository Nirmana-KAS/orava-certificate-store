import "server-only";

import { appendFile } from "node:fs/promises";

import { db } from "./db";
import { env, isProduction } from "./env";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** An email to a staff member (not the admin): stopped while the Email switch is off */
  staff?: boolean;
};

/** Thrown when the Control Center has the Email switch on Hold or Down. */
export class EmailSwitchedOff extends Error {
  constructor() {
    super("Email to staff is switched off in the Control Center");
  }
}

function from(): string {
  const e = env();
  return (
    e.MAIL_FROM ??
    (e.SMTP_USER
      ? `Orava Certificate Store <${e.SMTP_USER}>`
      : "Orava Certificate Store <onboarding@resend.dev>")
  );
}

/**
 * Sends an email with whichever free provider is configured:
 * 1. Gmail SMTP (app password): can email any staff address, about 500 a day.
 * 2. Resend: 100 a day, but only to your own address until you verify a domain.
 * Without either, development prints the email to the server console.
 */
export async function sendMail({ staff, ...mail }: Mail): Promise<void> {
  if (staff) {
    // Imported here: the switches module itself sends admin alerts through this file
    const { switchBlock } = await import("./switches");
    if (await switchBlock("email", null)) throw new EmailSwitchedOff();
  }
  try {
    await deliver(mail);
  } catch (error) {
    await logMail(false, (error as Error).message);
    throw error;
  }
  await logMail(true);
}

/** Counts each email for the System Map (daily limit, failures). No address or content. */
async function logMail(ok: boolean, error?: string): Promise<void> {
  try {
    await db()`insert into mail_log (ok, error) values (${ok}, ${error?.slice(0, 300) ?? null})`;
  } catch {
    // never let counting break sending
  }
}

async function deliver(mail: Mail): Promise<void> {
  const e = env();

  if (e.MAIL_FILE) {
    if (process.env.VERCEL) throw new Error("MAIL_FILE is for local tests only");
    await appendFile(e.MAIL_FILE, `${JSON.stringify({ ...mail, at: new Date().toISOString() })}\n`);
    return;
  }

  if (e.SMTP_USER && e.SMTP_APP_PASSWORD) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: e.SMTP_USER, pass: e.SMTP_APP_PASSWORD },
    });
    await transport.sendMail({ from: from(), ...mail });
    return;
  }

  if (e.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const { error } = await new Resend(e.RESEND_API_KEY).emails.send({ from: from(), ...mail });
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
  }

  if (!isProduction) {
    console.info(`\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  throw new Error(
    "No email provider configured (set SMTP_USER + SMTP_APP_PASSWORD or RESEND_API_KEY)",
  );
}
