import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminSetupForm } from "@/components/auth/admin-setup-form";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { adminExists } from "@/lib/server/admin";
import { encrypt } from "@/lib/server/crypto";
import { env } from "@/lib/server/env";
import { newTotpSecret, totpQr } from "@/lib/server/totp";

export const metadata: Metadata = { title: "Admin setup" };

export default async function AdminSetupPage() {
  if (await adminExists()) redirect("/admin/login");
  const e = env();

  if (!e.ADMIN_SETUP_TOKEN) {
    return (
      <AuthCard title="Admin setup" description="One-time setup of the admin account.">
        <Alert variant="warning">
          Add an <code>ADMIN_SETUP_TOKEN</code> environment variable (any long random text),
          redeploy, then reload this page.
        </Alert>
      </AuthCard>
    );
  }

  const secret = newTotpSecret();
  const { dataUrl } = await totpQr(secret, e.ADMIN_EMAIL);

  return (
    <AuthCard
      title="Admin setup"
      description="One-time setup. This page closes for good once the admin account exists."
    >
      <AdminSetupForm
        email={e.ADMIN_EMAIL}
        totpSecretEnc={encrypt(e.AUTH_SECRET, secret)}
        qrDataUrl={dataUrl}
        manualKey={secret.replace(/(.{4})/g, "$1 ").trim()}
      />
    </AuthCard>
  );
}
