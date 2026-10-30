import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { CodeForm } from "@/components/auth/code-form";
import { adminTotpAction } from "@/lib/auth/actions";
import { pendingChallenge } from "@/lib/server/challenges";

export const metadata: Metadata = { title: "Authenticator code" };

export default async function AdminVerifyPage() {
  const challenge = await pendingChallenge();
  if (!challenge || challenge.kind !== "totp") redirect("/admin/login");

  return (
    <AuthCard
      title="Authenticator code"
      description="Open your authenticator app and enter the 6-digit code for Orava Certificate Store."
      footer={
        <Link
          href="/admin/login"
          className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
        >
          Start again
        </Link>
      }
    >
      <CodeForm
        action={adminTotpAction}
        label="6-digit code"
        hint="The code changes every 30 seconds."
      />
    </AuthCard>
  );
}
