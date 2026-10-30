import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, homeFor } from "@/lib/server/session";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.user.role));

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-2 lg:gap-16 lg:px-8">
      <section aria-labelledby="intro-heading" className="max-w-xl">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Permitted staff only
        </p>
        <h1
          id="intro-heading"
          className="text-[clamp(1.75rem,5vw+0.5rem,3rem)] leading-tight font-semibold tracking-tight text-balance"
        >
          {site.name}
        </h1>
        <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
          Search, review and download company certificates in seconds. Every certificate shows its
          key points and a short summary.
        </p>
      </section>

      <div className="w-full max-w-md justify-self-center lg:justify-self-end">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your company email and the shared passkey.</CardDescription>
          </CardHeader>
          <CardContent>
            <SignInForm />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Administrator?{" "}
          <Link
            href="/admin/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Admin sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
