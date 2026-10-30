import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { CodeForm } from "@/components/auth/code-form";
import { verifyCodeAction } from "@/lib/auth/actions";
import { pendingChallenge } from "@/lib/server/challenges";

export const metadata: Metadata = { title: "Check your email" };

function mask(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export default async function VerifyPage() {
  const challenge = await pendingChallenge();
  if (!challenge || challenge.kind !== "email_code") redirect("/");

  return (
    <AuthCard
      title="Check your email"
      description={
        <>
          This is a new device, so we sent a 6-digit code to{" "}
          <strong>{mask(challenge.user.email)}</strong>.
        </>
      }
      footer={
        <>
          No email after a minute? Check spam, or{" "}
          <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
            sign in again
          </Link>
          .
        </>
      }
    >
      <CodeForm
        action={verifyCodeAction}
        label="Sign-in code"
        hint="The code expires in 10 minutes."
        remember
      />
    </AuthCard>
  );
}
