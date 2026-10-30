import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSignInForm } from "@/components/auth/admin-sign-in-form";
import { AuthCard } from "@/components/auth/auth-card";
import { adminExists } from "@/lib/server/admin";
import { getSession, homeFor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Admin sign in" };

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));
  if (!(await adminExists())) redirect("/admin/setup");

  return (
    <AuthCard
      title="Admin sign in"
      description="Your admin password, then a code from your authenticator app."
      footer={
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
        >
          Staff sign in
        </Link>
      }
    >
      <AdminSignInForm />
    </AuthCard>
  );
}
